'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken, subscribeActiveSession } from '@/lib/api';
import { useLooksOwnerScope } from '@/lib/looks/use-owner-scope';
import { queryKeys } from '@/lib/hooks/query-keys';
import { extractClothing, getExtractionCapabilities, saveExtractedPiece, validateSourceFile, ExtractionError, isExtractionType, type ExtractedPiece, type ExtractionCapabilities, type ExtractionErrorCode, type ExtractionType } from '@/lib/clothing-extraction';

export type CandidateStatus = 'idle' | 'pending' | 'saved' | 'error' | 'duplicate';
export interface ExtractionCandidate extends ExtractedPiece { name: string; selected: boolean; status: CandidateStatus; error?: ExtractionErrorCode; savedId?: string }
type WorkspaceState = { key: string; capabilities: ExtractionCapabilities | null; checking: boolean; extracting: boolean; saving: boolean; file: File | null; previewUrl: string | null; candidates: ExtractionCandidate[]; extracted: boolean; error: ExtractionErrorCode | null };
const empty = (key: string): WorkspaceState => ({ key, capabilities: null, checking: true, extracting: false, saving: false, file: null, previewUrl: null, candidates: [], extracted: false, error: null });
const errorCode = (error: unknown): ExtractionErrorCode => error instanceof ExtractionError ? error.code : 'requestFailed';

/** Volatile photo workspace: only saveSelected writes to the wardrobe. No private browser persistence. */
export function useClothingExtraction(owner: string) {
  const { ownerId, epoch, capture: captureScope } = useLooksOwnerScope();
  const key = `${ownerId}:${epoch}`;
  const queryClient = useQueryClient();
  const [state, setState] = useState<WorkspaceState>(() => empty(key));
  const stateRef = useRef(state); stateRef.current = state;
  const mounted = useRef(false);
  const generation = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const busySave = useRef(false);
  const busyExtract = useRef(false);
  const preview = useRef<string | null>(null);
  const resetPhoto = useCallback(() => {
    generation.current++;
    controllers.current.forEach(controller => controller.abort());
    controllers.current.clear();
    busyExtract.current = false;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
  }, []);
  const [capabilityAttempt, setCapabilityAttempt] = useState(0);
  useEffect(() => {
    mounted.current = true;
    resetPhoto(); busySave.current = false;
    setState(empty(key));
    if (ownerId !== owner) return () => { mounted.current = false; resetPhoto(); };
    const captured = captureScope();
    const controller = new AbortController(); controllers.current.add(controller);
    const originalToken = getAccessToken();
    const unsubscribe = subscribeActiveSession(() => {
      if (!captured.isCurrent() || getAccessToken() !== originalToken) {
        resetPhoto(); busySave.current = false;
        if (mounted.current) setState({ ...empty(key), checking: false, error: 'sessionChanged' });
      }
    });
    void getExtractionCapabilities(owner, controller.signal).then(capabilities => {
      if (mounted.current && captured.isCurrent() && !controller.signal.aborted) setState(previous => ({ ...previous, capabilities, checking: false }));
    }).catch(error => {
      if (mounted.current && captured.isCurrent() && !controller.signal.aborted) setState(previous => ({ ...previous, checking: false, error: errorCode(error) }));
    }).finally(() => controllers.current.delete(controller));
    return () => { mounted.current = false; unsubscribe(); resetPhoto(); };
  }, [owner, key, ownerId, captureScope, capabilityAttempt, resetPhoto]);

  const capture = useCallback(() => {
    const captured = captureScope();
    if (!mounted.current || captured.ownerId !== owner) throw new ExtractionError('sessionChanged');
    const version = generation.current;
    const token = getAccessToken();
    return () => mounted.current && captured.isCurrent() && version === generation.current && token === getAccessToken();
  }, [captureScope, owner]);
  const choose = useCallback((file: File) => {
    let current: () => boolean;
    try { current = capture(); } catch { return; }
    if (!current() || busySave.current) return;
    try { validateSourceFile(file, stateRef.current.capabilities?.max_bytes); }
    catch (error) { setState(previous => ({ ...previous, error: errorCode(error) })); return; }
    resetPhoto();
    const url = URL.createObjectURL(file); preview.current = url;
    setState(previous => ({ ...previous, file, previewUrl: url, candidates: [], extracted: false, extracting: false, error: null }));
  }, [capture, resetPhoto]);
  const clearPhoto = useCallback(() => {
    try { if (!capture()() || busySave.current) return; } catch { return; }
    resetPhoto();
    setState(previous => ({ ...previous, file: null, previewUrl: null, candidates: [], extracted: false, extracting: false, error: null }));
  }, [capture, resetPhoto]);
  const checkDimensions = useCallback((width: number, height: number, expectedUrl?: string) => {
    if (busySave.current || (expectedUrl && expectedUrl !== preview.current)) return;
    try { if (!capture()()) return; } catch { return; }
    if (!width || !height || width * height > (stateRef.current.capabilities?.max_pixels ?? 24_000_000)) {
      resetPhoto();
      setState(previous => ({ ...previous, file: null, previewUrl: null, candidates: [], extracted: false, extracting: false, error: width && height ? 'tooLarge' : 'invalidImage' }));
    }
  }, [capture, resetPhoto]);
  const extract = useCallback(async (label: (type: ExtractionType) => string) => {
    let current: () => boolean;
    try { current = capture(); } catch { return; }
    const snapshot = stateRef.current;
    if (busySave.current || busyExtract.current || !current()) return;
    if (!snapshot.capabilities?.available) { setState(previous => ({ ...previous, error: 'unavailable' })); return; }
    if (!snapshot.file) { setState(previous => ({ ...previous, error: 'invalidImage' })); return; }
    busyExtract.current = true;
    const controller = new AbortController(); controllers.current.add(controller);
    setState(previous => ({ ...previous, extracting: true, error: null, candidates: [], extracted: false }));
    try {
      validateSourceFile(snapshot.file, snapshot.capabilities.max_bytes);
      const result = await extractClothing(owner, snapshot.file, controller.signal);
      if (!current()) return;
      const candidates = result.pieces.map(piece => ({ ...piece, name: label(piece.type), selected: true, status: 'idle' as const }));
      setState(previous => ({ ...previous, candidates, extracted: true }));
    } catch (error) {
      if (current() && !controller.signal.aborted) setState(previous => ({ ...previous, error: errorCode(error) }));
    } finally {
      controllers.current.delete(controller);
      if (current()) { busyExtract.current = false; setState(previous => ({ ...previous, extracting: false })); }
    }
  }, [capture, owner]);
  const edit = useCallback((id: string, patch: { name?: string; type?: ExtractionType; selected?: boolean }) => {
    try { if (!capture()() || busySave.current || (patch.type !== undefined && !isExtractionType(patch.type))) return; } catch { return; }
    setState(previous => ({ ...previous, candidates: previous.candidates.map(candidate => candidate.id === id && !['pending', 'saved', 'duplicate'].includes(candidate.status) ? { ...candidate, ...patch, error: undefined, status: 'idle' } : candidate) }));
  }, [capture]);
  const saveSelected = useCallback(async () => {
    let current: () => boolean;
    try { current = capture(); } catch { return; }
    if (!current() || busySave.current || busyExtract.current) return;
    const selected = stateRef.current.candidates.filter(candidate => candidate.selected && ['idle', 'error'].includes(candidate.status));
    if (!selected.length) return;
    const invalidNames = selected.filter(candidate => !candidate.name.trim() || candidate.name.trim().length > 100 || /[\u0000-\u001f]/.test(candidate.name));
    if (invalidNames.length) {
      setState(previous => ({ ...previous, candidates: previous.candidates.map(candidate => invalidNames.some(invalid => invalid.id === candidate.id) ? { ...candidate, status: 'error', error: 'invalidName' } : candidate) }));
      return;
    }
    busySave.current = true;
    const controller = new AbortController(); controllers.current.add(controller);
    setState(previous => ({ ...previous, saving: true, error: null }));
    const update = (id: string, patch: Partial<ExtractionCandidate>) => {
      if (current()) setState(previous => ({ ...previous, candidates: previous.candidates.map(candidate => candidate.id === id ? { ...candidate, ...patch } : candidate) }));
    };
    try {
      // Sequential writes make partial success and cancellation unambiguous; a successful piece never re-enters the queue.
      for (const candidate of selected) {
        if (!current() || controller.signal.aborted) break;
        update(candidate.id, { status: 'pending', error: undefined });
        try {
          const saved = await saveExtractedPiece(owner, candidate, controller.signal);
          if (!current() || controller.signal.aborted) break;
          update(candidate.id, { status: 'saved', savedId: saved.id, error: undefined });
          void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
        } catch (error) {
          if (!current() || controller.signal.aborted) break;
          const code = errorCode(error);
          update(candidate.id, { status: code === 'duplicate' ? 'duplicate' : 'error', error: code });
          if (code === 'sessionChanged') break;
        }
      }
    } finally {
      controllers.current.delete(controller);
      if (current()) { busySave.current = false; setState(previous => ({ ...previous, saving: false })); }
    }
  }, [capture, owner, queryClient]);
  const retryCapabilities = useCallback(() => {
    try { if (!capture()() || busySave.current || busyExtract.current) return; } catch { return; }
    setCapabilityAttempt(value => value + 1);
  }, [capture]);
  const visible = state.key === key && ownerId === owner;
  const display = visible ? state : { ...empty(key), checking: false };
  return { ...display, choose, clearPhoto, checkDimensions, extract, edit, saveSelected, retryCapabilities };
}

/* eslint-disable @next/next/no-img-element -- Private local blob/data images must never pass through a remote image optimizer. */
'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Button } from '@mantine/core';
import { ArrowLeft, ArrowRight, Check, CheckCheck, ImagePlus, Layers2, Loader2, LockKeyhole, ScanLine, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLooksOwnerScope } from '@/lib/looks/use-owner-scope';
import { useTypeLabel } from '@/lib/hooks/use-translated-constants';
import { useClothingExtraction, type ExtractionCandidate } from '@/lib/hooks/use-clothing-extraction';
import { EXTRACTION_TYPES, type ExtractionType } from '@/lib/clothing-extraction';
import styles from './workspace.module.css';

export function ClothingExtractionWorkspace() {
  const { ownerId, epoch } = useLooksOwnerScope();
  const t = useTranslations('wardrobe.extraction');
  return ownerId ? <ExtractionBody key={`${ownerId}:${epoch}`} owner={ownerId} /> : <div className={styles.workspace}><p role="status">{t('sessionRequired')}</p></div>;
}

function ExtractionBody({ owner }: { owner: string }) {
  const t = useTranslations('wardrobe.extraction');
  const typeLabel = useTypeLabel();
  const flow = useClothingExtraction(owner);
  const inputId = useId();
  const ready = !!flow.capabilities?.available;
  const eligible = flow.candidates.filter(piece => piece.selected && ['idle', 'error'].includes(piece.status));
  const savedCount = flow.candidates.filter(piece => piece.status === 'saved').length;
  const maxMb = Math.ceil((flow.capabilities?.max_bytes ?? 8 * 1024 * 1024) / 1024 / 1024);
  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}><ScanLine size={14} aria-hidden="true" />{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </div>
      <nav className={styles.headerLinks} aria-label={t('navigationLabel')}>
        <Link href="/dashboard/wardrobe"><ArrowLeft size={15} aria-hidden="true" />{t('backWardrobe')}</Link>
        <Link href="/dashboard/wardrobe/avatar">{t('backAvatar')}<ArrowRight size={15} aria-hidden="true" /></Link>
      </nav>
    </header>
    <ol className={styles.steps} aria-label={t('stepsLabel')}>
      {(['stepPhoto', 'stepReview', 'stepSave'] as const).map((step, index) => <li key={step} data-active={index === 0 ? !flow.extracted : index === 1 ? flow.extracted && !savedCount : savedCount > 0}><span>{index + 1}</span>{t(step)}</li>)}
    </ol>
    <div className={styles.columns}>
      <section className={styles.sourcePanel} aria-labelledby={`${inputId}-source`}>
        <div className={styles.panelHeading}><h2 id={`${inputId}-source`}>{t('sourceTitle')}</h2><span className={styles.smallTag}>{t('sourceTag')}</span></div>
        <div className={styles.photoFrame}>
          {flow.previewUrl ? <>
            <img className={styles.sourcePhoto} src={flow.previewUrl} alt={t('sourceAlt')} onLoad={event => flow.checkDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight, flow.previewUrl ?? undefined)} onError={() => flow.checkDimensions(0, 0, flow.previewUrl ?? undefined)} />
            <span className={styles.photoBadge}><LockKeyhole size={12} aria-hidden="true" />{t('privatePreview')}</span>
            <button type="button" className={styles.removePhoto} aria-label={t('removePhoto')} disabled={flow.saving} onClick={flow.clearPhoto}><X size={17} aria-hidden="true" /></button>
          </> : <div className={styles.photoEmpty}>
            <span className={styles.uploadIcon}><ImagePlus size={31} strokeWidth={1.3} aria-hidden="true" /></span>
            <h3>{t('photoEmptyTitle')}</h3><p>{t('photoEmptyHint')}</p>
            <span className={styles.formatHint}>{t('formats', { size: maxMb })}</span>
          </div>}
        </div>
        <input id={inputId} className={styles.fileInput} type="file" aria-label={t('choosePhoto')} accept="image/jpeg,image/png,image/webp" disabled={!ready || flow.checking || flow.saving} onChange={event => { const file = event.target.files?.[0]; if (file) flow.choose(file); event.target.value = ''; }} />
        <label className={styles.fileLabel} data-disabled={!ready || flow.checking || flow.saving} htmlFor={inputId}><ImagePlus size={16} aria-hidden="true" />{t(flow.previewUrl ? 'replacePhoto' : 'choosePhoto')}</label>
        {flow.previewUrl ? <p className={styles.fileDetails}>{flow.file?.name}<span>{t('formats', { size: maxMb })}</span></p> : null}
        <Button fullWidth size="md" radius="md" color="#a24f63" leftSection={<ScanLine size={17} aria-hidden="true" />} loading={flow.extracting} disabled={!ready || !flow.file || flow.saving || flow.checking} onClick={() => void flow.extract(typeLabel)}>{t(flow.extracting ? 'extracting' : 'extract')}</Button>
        <p className={styles.localNote}><ShieldCheck size={15} aria-hidden="true" /><span>{t('localProcessing')}</span></p>
        {flow.checking ? <p className={styles.serviceStatus} role="status"><Loader2 size={14} className={styles.spinner} aria-hidden="true" />{t('checkingService')}</p> : !ready ? <div className={styles.serviceNotice} role="status"><strong>{t('serviceUnavailable')}</strong><p>{t('serviceUnavailableHint')}</p><Button variant="subtle" color="#a24f63" size="compact-sm" onClick={flow.retryCapabilities}>{t('retryService')}</Button></div> : null}
        {flow.error ? <p className={styles.errorNotice} role="alert">{t(`errors.${flow.error}`)}</p> : null}
      </section>
      <section className={styles.reviewPanel} aria-labelledby={`${inputId}-review`} aria-busy={flow.extracting || flow.saving}>
        <div className={styles.reviewHeading}>
          <div><p className={styles.panelEyebrow}>{t('reviewEyebrow')}</p><h2 id={`${inputId}-review`}>{t('reviewTitle')}{flow.candidates.length ? <span className={styles.count}>{flow.candidates.length}</span> : null}</h2></div>
          <span className={styles.reviewBadge}><CheckCheck size={14} aria-hidden="true" />{t('reviewRequired')}</span>
        </div>
        <p className={styles.reviewIntro}>{t('reviewHint')}</p>
        {flow.extracting ? <div className={styles.reviewEmpty} role="status"><span className={styles.scanningIcon}><ScanLine size={37} strokeWidth={1.2} aria-hidden="true" /></span><h3>{t('extracting')}</h3><p>{t('extractingHint')}</p><Loader2 size={22} className={styles.spinner} aria-hidden="true" /></div> : flow.candidates.length ? <div className={styles.candidateGrid}>{flow.candidates.map(piece => <CandidateCard key={piece.id} piece={piece} disabled={flow.saving} onEdit={patch => flow.edit(piece.id, patch)} />)}</div> : <div className={styles.reviewEmpty}><span className={styles.emptyIcon}><Layers2 size={39} strokeWidth={1.2} aria-hidden="true" /></span><h3>{t(flow.extracted ? 'noPiecesTitle' : 'reviewEmptyTitle')}</h3><p>{t(flow.extracted ? 'noPiecesHint' : 'reviewEmptyHint')}</p><span className={styles.emptyPill}><Sparkles size={13} aria-hidden="true" />{t('noAutoSave')}</span></div>}
        <div className={styles.honestyNote}><ScanLine size={17} aria-hidden="true" /><p>{t('visibleGarmentsNotice')}</p></div>
        {flow.candidates.length ? <footer className={styles.reviewFooter}>
          <div><strong>{t('selectedCount', { count: eligible.length })}</strong><p>{t('saveConsent')}</p></div>
          <Button size="md" radius="md" color="#a24f63" loading={flow.saving} disabled={!eligible.length || flow.extracting} leftSection={<Check size={16} aria-hidden="true" />} onClick={() => void flow.saveSelected()}>{t(flow.saving ? 'saving' : 'saveSelected', { count: eligible.length })}</Button>
        </footer> : null}
        {savedCount ? <div className={styles.successNotice} role="status"><span><CheckCheck size={17} aria-hidden="true" />{t('savedSummary', { count: savedCount })}</span><Link href="/dashboard/wardrobe">{t('viewWardrobe')}<ArrowRight size={14} aria-hidden="true" /></Link></div> : null}
      </section>
    </div>
  </main>;
}

function CandidateCard({ piece, disabled, onEdit }: { piece: ExtractionCandidate; disabled: boolean; onEdit: (patch: { name?: string; type?: ExtractionType; selected?: boolean }) => void }) {
  const t = useTranslations('wardrobe.extraction');
  const typeLabel = useTypeLabel();
  const id = useId();
  const locked = disabled || piece.status === 'saved' || piece.status === 'duplicate';
  return <fieldset className={styles.candidate} data-selected={piece.selected} data-status={piece.status} aria-label={t('pieceLabel', { name: typeLabel(piece.type) })}>
    <legend className={styles.srOnly}>{t('pieceLabel', { name: typeLabel(piece.type) })}</legend>
    <div className={styles.piecePhoto}>
      <img src={piece.thumbnail_data_url} alt={t('pieceAlt', { name: typeLabel(piece.type) })} />
      <label className={styles.pieceCheck}><input type="checkbox" checked={piece.selected} disabled={locked} onChange={event => onEdit({ selected: event.target.checked })} /><span>{t('selectPiece', { name: typeLabel(piece.type) })}</span></label>
      {piece.status === 'saved' ? <span className={styles.savedBadge}><Check size={13} aria-hidden="true" />{t('saved')}</span> : null}
    </div>
    <div className={styles.pieceFields}>
      <label htmlFor={`${id}-name`}>{t('nameLabel')}</label><input className={styles.textInput} id={`${id}-name`} value={piece.name} maxLength={100} required disabled={locked} aria-invalid={piece.error === 'invalidName'} onChange={event => onEdit({ name: event.target.value })} />
      <label htmlFor={`${id}-type`}>{t('typeLabel')}</label><select className={styles.textInput} id={`${id}-type`} value={piece.type} disabled={locked} onChange={event => onEdit({ type: event.target.value as ExtractionType })}>{EXTRACTION_TYPES.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}</select>
      {piece.status !== 'saved' ? <p className={piece.error ? styles.pieceError : styles.pieceStatus} role={piece.error ? 'alert' : 'status'}>{piece.status === 'pending' ? <Loader2 size={12} className={styles.spinner} aria-hidden="true" /> : null}{piece.error ? t(`errors.${piece.error}`) : t(piece.status === 'pending' ? 'savingPiece' : 'reviewStatus')}</p> : null}
    </div>
  </fieldset>;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Devices stay local. Only the separate generation action can upload a captured File. */
export function useFittingCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const device = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const alive = useRef(true);
  const opening = useRef(false);
  const stop = useCallback(() => {
    request.current += 1;
    opening.current = false;
    device.current?.getTracks().forEach((track) => track.stop());
    device.current = null;
    if (alive.current) {
      setStream(null);
      setPending(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);
  const start = useCallback(async () => {
    if (!alive.current || opening.current || device.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(true);
      return;
    }
    const ticket = ++request.current;
    opening.current = true;
    setPending(true);
    setError(false);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1080 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      if (!alive.current || request.current !== ticket) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      device.current = next;
      setStream(next);
    } catch {
      if (alive.current && request.current === ticket) setError(true);
    } finally {
      if (alive.current && request.current === ticket) {
        opening.current = false;
        setPending(false);
      }
    }
  }, []);
  const capture = useCallback(
    async (video: HTMLVideoElement): Promise<File> => {
      if (
        !alive.current ||
        !device.current ||
        !video.videoWidth ||
        !video.videoHeight
      )
        throw new Error("Camera frame unavailable");
      const ticket = request.current;
      const scale = Math.min(
        1,
        2048 / Math.max(video.videoWidth, video.videoHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Camera capture unavailable");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("Camera capture failed")),
          "image/jpeg",
          0.92,
        ),
      );
      canvas.width = 0;
      canvas.height = 0;
      if (!alive.current || request.current !== ticket)
        throw new Error("Camera session changed");
      stop();
      return new File([blob], "fitting-photo.jpg", { type: "image/jpeg" });
    },
    [stop],
  );
  return { stream, pending, error, start, stop, capture };
}

type RecognitionResult = {
  isFinal: boolean;
  [index: number]: { transcript: string };
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
const speechConstructor = () => {
  const w = window as SpeechWindow;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};
/** Recognition is optional and never auto-starts or submits a generation. */
export function useFittingVoice(
  onTranscript: (value: string) => void,
  lang: string,
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef<Recognition | null>(null);
  const receive = useRef(onTranscript);
  receive.current = onTranscript;
  const stop = useCallback(() => {
    const current = active.current;
    active.current = null;
    current?.abort();
    setListening(false);
  }, []);
  useEffect(() => {
    setSupported(!!speechConstructor());
    return () => {
      const current = active.current;
      active.current = null;
      current?.abort();
    };
  }, []);
  const start = useCallback(() => {
    const Constructor = speechConstructor();
    if (!Constructor || active.current) return;
    const recognition = new Constructor();
    active.current = recognition;
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      if (active.current !== recognition) return;
      const result = Array.from(event.results).find((value) => value.isFinal);
      if (result?.[0]?.transcript.trim())
        receive.current(result[0].transcript.trim());
    };
    recognition.onerror = () => {
      if (active.current === recognition) {
        setError(true);
        setListening(false);
        active.current = null;
        recognition.abort();
      }
    };
    recognition.onend = () => {
      if (active.current === recognition) {
        setListening(false);
        active.current = null;
      }
    };
    try {
      setError(false);
      recognition.start();
      setListening(true);
    } catch {
      active.current = null;
      setError(true);
      setListening(false);
    }
  }, [lang]);
  return { supported, listening, error, start, stop };
}

import { useEffect, useId, useRef, useState } from "react";
import { Clapperboard, ImageIcon, Loader2, Mic, Sparkles, Volume2, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { loadPass } from "@/lib/pay/pass";
import { directScene, speakPrompt, transcribeAudio } from "@/lib/imagine/tools";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

export function AiChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Herramientas de IA"
      className={cn(
        "hud-chip inline-flex h-11 shrink-0 items-center gap-2 bg-elevated px-3 font-display text-[10px] font-semibold tracking-[0.12em] uppercase shadow-[var(--shadow-border)] transition-[box-shadow,color] duration-150 hover:shadow-[var(--shadow-border-hover)] md:h-9",
        active ? "text-fg" : "text-muted hover:text-fg",
      )}
    >
      <Sparkles className="size-3.5" strokeWidth={1.75} />
      <span className="hidden sm:inline">IA</span>
    </button>
  );
}

export function AiTools({
  open,
  paywall,
  onNeedPay,
  onClose,
}: {
  open: boolean;
  paywall?: boolean;
  onNeedPay?: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileId = useId();
  const setMode = useStudio((s) => s.setMode);
  const setPrompt = useStudio((s) => s.setPrompt);
  const prompt = useStudio((s) => s.prompt);
  const [brief, setBrief] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState<"direct" | "speak" | "dict" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
    };
  }, []);

  if (!open) return null;

  function gated(): boolean {
    if (!paywall) return false;
    onNeedPay?.();
    return true;
  }

  async function runDirect() {
    if (gated()) return;
    const text = brief.trim() || prompt.trim();
    if (text.length < 3) {
      setError("Escribe una idea para dirigirla.");
      return;
    }
    setBusy("direct");
    setError(null);
    try {
      const result = await directScene({
        data: { brief: text, current: prompt.trim() || undefined, pass: loadPass() },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(result.prompt);
      setNote(result.note || null);
    } catch {
      setError("No se pudo dirigir la escena.");
    } finally {
      setBusy(null);
    }
  }

  async function runSpeak() {
    if (gated()) return;
    const text = (draft ?? prompt).trim();
    if (text.length < 3) {
      setError("Escribe o dirige un prompt para narrarlo.");
      return;
    }
    setBusy("speak");
    setError(null);
    try {
      const result = await speakPrompt({ data: { text: text.slice(0, 500), pass: loadPass() } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAudio(result.audioDataUrl);
    } catch {
      setError("No se pudo narrar el texto.");
    } finally {
      setBusy(null);
    }
  }

  async function sendAudio(file: Blob) {
    if (gated()) return;
    if (file.size > 2_800_000) {
      setError("El audio es demasiado pesado.");
      return;
    }
    setBusy("dict");
    setError(null);
    try {
      const audioDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const result = await transcribeAudio({ data: { audioDataUrl, pass: loadPass() } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBrief(result.text);
      setDraft(result.text);
      setNote("Dictado listo. Úsalo en el mando o dirígelo.");
    } catch {
      setError("No se pudo transcribir el audio.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleMic() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (gated()) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        void sendAudio(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setError(null);
    } catch {
      setError("No hay permiso de micrófono.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-bg/70 transition-opacity duration-200"
        onClick={onClose}
      />
      <div className="hud-shell relative w-full max-w-md">
        <div className="hud-frame">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="hud-frame-inner max-h-[min(92dvh,720px)] overflow-y-auto p-5 sm:p-6"
          >
            <div className="mb-4 flex items-start gap-3">
              <div>
                <h2 id={titleId} className="font-display text-lg tracking-[0.12em] text-fg uppercase">
                  Herramientas
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Prueba Grok dentro de Lumen: director, voz y dictado. El mando sigue igual.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="hud-chip ml-auto inline-flex size-11 items-center justify-center text-muted transition-colors duration-150 hover:bg-elevated hover:text-fg sm:size-9"
              >
                <X className="size-4" />
                <span className="sr-only">Cerrar</span>
              </button>
            </div>

            <ul className="mb-4 grid grid-cols-2 gap-2">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMode("image");
                    onClose();
                  }}
                  className="hud-chip flex min-h-11 w-full items-center gap-2 bg-elevated px-3 text-left text-xs text-fg shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
                >
                  <ImageIcon className="size-3.5 text-muted" />
                  Imagen
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMode("video");
                    onClose();
                  }}
                  className="hud-chip flex min-h-11 w-full items-center gap-2 bg-elevated px-3 text-left text-xs text-fg shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
                >
                  <Clapperboard className="size-3.5 text-muted" />
                  Vídeo
                </button>
              </li>
            </ul>

            <label className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
              Director
            </label>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Una idea, un recuerdo, un plano…"
              className="mt-2 min-h-20"
              disabled={Boolean(busy)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" disabled={Boolean(busy)} onClick={() => void runDirect()}>
                {busy === "direct" ? <Loader2 className="animate-spin" /> : <WandSparkles className="size-3.5" />}
                Dirigir
              </Button>
              <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void runSpeak()}>
                {busy === "speak" ? <Loader2 className="animate-spin" /> : <Volume2 className="size-3.5" />}
                Narrar
              </Button>
              <Button
                type="button"
                variant={recording ? "default" : "secondary"}
                disabled={busy === "dict"}
                onClick={() => void toggleMic()}
              >
                {busy === "dict" ? <Loader2 className="animate-spin" /> : <Mic className="size-3.5" />}
                {recording ? "Parar" : "Dictar"}
              </Button>
              <label
                htmlFor={fileId}
                className="hud-chip inline-flex min-h-11 cursor-pointer items-center px-3 text-xs text-muted hover:text-fg"
              >
                Audio
              </label>
              <input
                id={fileId}
                type="file"
                accept="audio/*,video/mp4"
                className="sr-only"
                disabled={Boolean(busy)}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void sendAudio(file);
                }}
              />
            </div>

            {draft ? (
              <div className="hud-chip mt-4 bg-elevated p-3">
                {note ? <p className="text-xs text-subtle">{note}</p> : null}
                <p className="mt-1 text-sm text-fg">{draft}</p>
                <Button
                  type="button"
                  className="mt-3"
                  onClick={() => {
                    setPrompt(draft);
                    onClose();
                  }}
                >
                  Usar en el mando
                </Button>
              </div>
            ) : null}

            {audio ? (
              <audio className="mt-3 w-full" controls src={audio} preload="metadata">
                Narración
              </audio>
            ) : null}

            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

            <p className="mt-4 text-xs text-subtle">
              Restaurar un MP4 dañado está en Vídeo. Tomas y Mejorar siguen en el mando.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AiChip, AiTools } from "@/components/studio/ai-tools";
import { BrandLockup } from "@/components/studio/brand-lockup";
import { BrandChip, BrandPack } from "@/components/studio/brand-pack";
import { Composer } from "@/components/studio/composer";
import { GalleryRail } from "@/components/studio/gallery-rail";
import { HudPanel } from "@/components/studio/hud-panel";
import { NeonTray } from "@/components/studio/neon-tray";
import { PayChip, PayPanel } from "@/components/studio/pay-panel";
import { ShotBoard } from "@/components/studio/shot-board";
import { Stage } from "@/components/studio/stage";
import { VideoPromptBoard } from "@/components/studio/video-prompts";
import { initGpu } from "@/lib/gl-blit";
import { applyNeon, loadNeon, saveNeon, type NeonId } from "@/lib/neon";
import { isPassActive, loadPass, passLabel, savePass, type StudioPass } from "@/lib/pay/pass";
import { confirmCheckout, getPayStatus } from "@/lib/pay/server";
import { useStudio } from "@/lib/studio-store";

export function Studio() {
  const hydrate = useStudio((s) => s.hydrate);
  const [brandOpen, setBrandOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [neon, setNeon] = useState<NeonId>("amber");
  const [pass, setPass] = useState<StudioPass | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  useEffect(() => {
    initGpu();
    void hydrate();
    const next = loadNeon();
    setNeon(next);
    applyNeon(next);
    setPass(loadPass());
    void getPayStatus()
      .then((status) => setStripeReady(status.ready))
      .catch(() => setStripeReady(false));
  }, [hydrate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("pago");
    const sessionId = params.get("session_id");
    if (flag === "cancel") {
      toast("Pago cancelado.");
      params.delete("pago");
      params.delete("session_id");
      const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
      setPayOpen(true);
      return;
    }
    if (flag !== "ok" || !sessionId) return;
    let cancelled = false;
    void confirmCheckout({ data: { sessionId } }).then((result) => {
      if (cancelled) return;
      params.delete("pago");
      params.delete("session_id");
      const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
      if (!result.ok) {
        toast(result.error);
        setPayOpen(true);
        return;
      }
      savePass(result.pass);
      setPass(result.pass);
      toast("Pase activado. Ya puedes generar.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onNeon(id: NeonId) {
    setNeon(id);
    applyNeon(id);
    saveNeon(id);
  }

  const active = isPassActive(pass);
  const paywall = stripeReady && !active;

  return (
    <div className="hud-app relative min-h-dvh text-fg lg:h-dvh lg:overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-3 px-3 py-3 md:px-4 md:py-4 lg:h-dvh">
        <header className="hud-shell shrink-0">
          <div className="hud-frame">
            <div className="hud-frame-inner flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-2.5">
              <BrandLockup />
              <div className="flex min-w-0 items-center gap-2 sm:ml-auto">
                <NeonTray value={neon} onChange={onNeon} />
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <AiChip active={aiOpen} onClick={() => setAiOpen(true)} />
                  <BrandChip onClick={() => setBrandOpen(true)} />
                  {stripeReady ? (
                    <PayChip
                      label={passLabel(pass)}
                      active={active}
                      onClick={() => setPayOpen(true)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(250px,310px)_minmax(0,1fr)] lg:items-stretch">
          <HudPanel
            label="Mando"
            className="order-2 min-h-0 lg:order-1 lg:h-full"
            innerClassName="flex min-h-0 flex-col overflow-y-auto"
          >
            <Composer paywall={paywall} onNeedPay={() => setPayOpen(true)} />
          </HudPanel>
          <div className="order-1 flex min-h-0 flex-col gap-3 lg:order-2">
            <HudPanel
              label="Visor"
              className="min-h-0 flex-1"
              innerClassName="flex min-h-0 flex-1 flex-col"
            >
              <Stage />
            </HudPanel>
            <ShotBoard />
            <VideoPromptBoard />
            <GalleryRail />
          </div>
        </div>
      </div>
      <BrandPack open={brandOpen} onClose={() => setBrandOpen(false)} />
      <AiTools open={aiOpen} paywall={paywall} onNeedPay={() => setPayOpen(true)} onClose={() => setAiOpen(false)} />
      <PayPanel open={payOpen && stripeReady} onClose={() => setPayOpen(false)} />
    </div>
  );
}

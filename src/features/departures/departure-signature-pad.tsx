"use client";

import { useEffect, useRef, useState } from "react";

export function DepartureSignaturePad({ name = "signature_data_url" }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ratio = Math.max(2, window.devicePixelRatio || 1); const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio);
    const context = canvas.getContext("2d"); if (!context) return; context.scale(ratio, ratio); context.lineWidth = 2.5; context.lineCap = "round"; context.strokeStyle = "#111827";
  }, []);
  function point(event: React.PointerEvent<HTMLCanvasElement>) { const box = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; }
  function start(event: React.PointerEvent<HTMLCanvasElement>) { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); const context = event.currentTarget.getContext("2d"); context?.beginPath(); context?.moveTo(p.x, p.y); }
  function move(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const p = point(event); const context = event.currentTarget.getContext("2d"); context?.lineTo(p.x, p.y); context?.stroke(); }
  function end(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; drawing.current = false; setValue(event.currentTarget.toDataURL("image/png")); }
  function clear() { const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height); setValue(""); }
  return <div><input type="hidden" name={name} value={value} /><canvas ref={canvasRef} aria-label="Zone de signature de la famille" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="h-52 w-full touch-none rounded-xl border-2 border-dashed bg-white" /><div className="mt-2 flex justify-between gap-3"><p className="text-xs text-muted">Signez avec le doigt ou le stylet.</p><button type="button" onClick={clear} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Effacer</button></div>{!value ? <p className="mt-2 text-xs font-semibold text-amber-800">Une signature est requise avant l’archivage.</p> : null}</div>;
}

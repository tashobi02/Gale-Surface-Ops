import { useRef, useState, type ReactElement } from "react";
import { PERMISSIONS } from "@marswalk/protocol";
import { provAttrs, unavailableOf } from "../components/provenance";

/** Local join links remain available even when the QR endpoint is unavailable. */
export function QrDrawer({ initiallyOpen = false, open: controlledOpen, onOpenChange }: { initiallyOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }): ReactElement {
  const [localOpen, setLocalOpen] = useState(initiallyOpen);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean): void => { setLocalOpen(next); onOpenChange?.(next); };
  const [failed, setFailed] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (): void => { setOpen(false); trigger.current?.focus(); };
  return <section aria-label="Join devices" style={{ position: "relative" }}>
    <button ref={trigger} type="button" style={{ minHeight: 44 }} aria-label="Join QR codes" aria-expanded={open} onClick={() => setOpen(!open)}>Join QR codes</button>
    {open && <div role="group" aria-label="Join QR codes" tabIndex={controlledOpen === undefined ? undefined : 0} style={controlledOpen === undefined ? undefined : { position: "absolute", right: 0, top: "100%", zIndex: 10, width: "min(90vw, 640px)", maxHeight: "75vh", overflow: "auto", padding: 16, background: "var(--panel, #14181D)", border: "1px solid var(--edge, #5C6670)" }} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <button type="button" style={{ minHeight: 44 }} onClick={close}>Close</button>
      <div className="presenter-qr">{(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((role) => <figure key={role}>
        {failed.includes(role) ? <p {...provAttrs(unavailableOf(null, "api/join-qr"))}>—</p> : <img data-provenance="derived" data-source={`api/join-qr?role=${encodeURIComponent(role)}`} src={`api/join-qr?role=${encodeURIComponent(role)}`} alt={`Join as ${role}`} width="144" height="144" onError={() => setFailed((previous) => [...previous, role])} />}
        <figcaption data-provenance="assumed" data-source="spec:02-E.4"><a style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }} href={`#/join?role=${encodeURIComponent(role)}`}>{role}</a></figcaption>
      </figure>)}</div>
    </div>}
  </section>;
}

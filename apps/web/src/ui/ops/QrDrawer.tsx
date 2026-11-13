import { useRef, useState, type CSSProperties, type ReactElement } from "react";
import { PERMISSIONS } from "@marswalk/protocol";
import { provAttrs, unavailableOf } from "../components/provenance";

/** The ops console's own button look (scr11OpsConsole `buttonStyle`); the presenter panel styles its buttons in CSS. */
const OPS_BUTTON: CSSProperties = { minHeight: 32, padding: "4px 12px", backgroundColor: "var(--raised, #1C2128)", color: "var(--text-1, #ECEFF2)", border: "1px solid var(--edge, #5C6670)", cursor: "pointer", fontFamily: "var(--font-mono, monospace)", fontSize: 13 };

/**
 * Local join links remain available even when the QR endpoint is unavailable (each QR image degrades to "—" with
 * `data-unavailable`; the link under it stays). Controlled by its caller (`open`), it is the ops console's popover and hangs from
 * the nearest positioned ancestor (the top bar), inside the viewport at every width the console supports (FD-210: 1024 px and up).
 * Uncontrolled (`initiallyOpen`), it is an inline section (the presenter panel).
 */
export function QrDrawer({ initiallyOpen = false, open: controlledOpen, onOpenChange }: { initiallyOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }): ReactElement {
  const [localOpen, setLocalOpen] = useState(initiallyOpen);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean): void => { setLocalOpen(next); onOpenChange?.(next); };
  const [failed, setFailed] = useState<string[]>([]);
  const popover = controlledOpen !== undefined;
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (): void => { setOpen(false); trigger.current?.focus(); };
  return <section aria-label="Join devices">
    <button ref={trigger} type="button" style={popover ? OPS_BUTTON : { minHeight: 44 }} aria-label="Join QR codes" aria-expanded={open} onClick={() => setOpen(!open)}>Join QR codes</button>
    {open && <div role="group" aria-label="Join QR codes" tabIndex={popover ? 0 : undefined} style={popover ? { position: "absolute", right: 16, top: "100%", zIndex: 10, boxSizing: "border-box", width: "min(calc(100vw - 32px), 640px)", maxHeight: "75vh", overflow: "auto", padding: 16, background: "var(--panel, #14181D)", border: "1px solid var(--edge, #5C6670)" } : undefined} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <button type="button" style={popover ? OPS_BUTTON : { minHeight: 44 }} onClick={close}>Close</button>
      <div className="presenter-qr">{(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((role) => <figure key={role}>
        {failed.includes(role) ? <p {...provAttrs(unavailableOf(null, "api/join-qr"))}>—</p> : <img data-provenance="derived" data-source={`api/join-qr?role=${encodeURIComponent(role)}`} src={`api/join-qr?role=${encodeURIComponent(role)}`} alt={`Join as ${role}`} width="144" height="144" onError={() => setFailed((previous) => [...previous, role])} />}
        <figcaption data-provenance="assumed" data-source="spec:02-E.4"><a style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 }} href={`#/join?role=${encodeURIComponent(role)}`}>{role}</a></figcaption>
      </figure>)}</div>
    </div>}
  </section>;
}

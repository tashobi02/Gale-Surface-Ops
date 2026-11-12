import { useRef, useState, type ReactElement } from "react";
import { PERMISSIONS } from "@marswalk/protocol";
import { provAttrs, unavailableOf } from "../components/provenance";

/** Local join links remain available even when the QR endpoint is unavailable. */
export function QrDrawer({ initiallyOpen = false }: { initiallyOpen?: boolean }): ReactElement {
  const [open, setOpen] = useState(initiallyOpen);
  const [failed, setFailed] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (): void => { setOpen(false); trigger.current?.focus(); };
  return <section aria-label="Join devices">
    <button ref={trigger} type="button" style={{ minHeight: 44 }} aria-label="Join QR codes" aria-expanded={open} onClick={() => setOpen(!open)}>Join QR codes</button>
    {open && <div role="group" aria-label="Join QR codes" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <button type="button" style={{ minHeight: 44 }} onClick={close}>Close</button>
      <div className="presenter-qr">{(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((role) => <figure key={role}>
        {failed.includes(role) ? <p {...provAttrs(unavailableOf(null, "api/join-qr"))}>—</p> : <img data-provenance="derived" data-source={`api/join-qr?role=${encodeURIComponent(role)}`} src={`api/join-qr?role=${encodeURIComponent(role)}`} alt={`Join as ${role}`} width="144" height="144" onError={() => setFailed((previous) => [...previous, role])} />}
        <figcaption data-provenance="assumed" data-source="spec:02-E.4"><a href={`#/join?role=${encodeURIComponent(role)}`}>{role}</a></figcaption>
      </figure>)}</div>
    </div>}
  </section>;
}

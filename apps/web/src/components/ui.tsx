import { useEffect, useRef, type ReactNode } from 'react';
import type { AppointmentStatus, QueueStatus } from '../types/clinic';

const statusClass: Record<AppointmentStatus | QueueStatus, string> = {
  'مجدول': 'blue', 'حضر': 'amber', 'مكتمل': 'green', 'ملغي': 'gray',
  'انتظار': 'amber', 'داخل الغرفة': 'blue', 'انتهى': 'green',
};

export function Stat({ label, value, accent, icon, note }: {label:string;value:string;accent:string;icon:string;note:string}) { return <div className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
export function PanelHeading({ title, detail, action, onClick }: {title:string;detail?:string;action?:string;onClick?:()=>void}) {return <div className="panel-heading"><div><h2>{title}</h2>{detail && <span>{detail}</span>}</div>{action && <button onClick={onClick}>{action} ←</button>}</div>;}
export function Status({value}:{value:AppointmentStatus | QueueStatus}) {return <span className={`status ${statusClass[value]}`}>{value}</span>;}
export function Empty({text}:{text:string}) {return <p className="empty">{text}</p>;}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  const origin=useRef(document.activeElement as HTMLElement|null);
  useEffect(()=>{
    const previous=origin.current;
    const focusable=()=>[...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[])];
    if(!ref.current?.contains(document.activeElement)) (ref.current?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')??focusable()[0]??ref.current)?.focus();
    const handler=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();close.current();}
      if(e.key==='Tab'){const list=focusable(),first=list[0],last=list.at(-1);if(!first){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    };
    document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
  },[]);
  return <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget)onClose();}}><div ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button aria-label="إغلاق" onClick={onClose}>×</button></div>{children}</div></div>;}

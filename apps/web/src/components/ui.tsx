import type { ReactNode } from 'react';
import type { AppointmentStatus, QueueStatus } from '../types/clinic';

const statusClass: Record<AppointmentStatus | QueueStatus, string> = {
  'مجدول': 'blue', 'حضر': 'amber', 'مكتمل': 'green', 'ملغي': 'gray',
  'انتظار': 'amber', 'داخل الغرفة': 'blue', 'انتهى': 'green',
};

export function Stat({ label, value, accent, icon, note }: {label:string;value:string;accent:string;icon:string;note:string}) { return <div className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
export function PanelHeading({ title, detail, action, onClick }: {title:string;detail?:string;action?:string;onClick?:()=>void}) {return <div className="panel-heading"><div><h2>{title}</h2>{detail && <span>{detail}</span>}</div>{action && <button onClick={onClick}>{action} ←</button>}</div>;}
export function Status({value}:{value:AppointmentStatus | QueueStatus}) {return <span className={`status ${statusClass[value]}`}>{value}</span>;}
export function Empty({text}:{text:string}) {return <p className="empty">{text}</p>;}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {return <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget)onClose();}}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button aria-label="إغلاق" onClick={onClose}>×</button></div>{children}</div></div>;}

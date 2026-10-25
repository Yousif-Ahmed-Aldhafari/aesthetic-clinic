export function clinicToday(timeZone:string,now=new Date()){
  const p=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>p.find(x=>x.type===type)!.value;return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(day:string,days:number){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function weekStart(day:string){const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();return addDays(day,-((weekday+1)%7));}
export const localDateLabel=(day:string)=>new Intl.DateTimeFormat('ar-YE',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(`${day}T12:00:00Z`));
export const instantLabel=(instant:string,timeZone:string)=>new Intl.DateTimeFormat('ar-YE',{timeZone,dateStyle:'medium',timeStyle:'short'}).format(new Date(instant));
export const timeLabel=(instant:string,timeZone:string)=>new Intl.DateTimeFormat('ar-YE',{timeZone,hour:'2-digit',minute:'2-digit'}).format(new Date(instant));
export const weekdays=[{value:6,label:'السبت'},{value:7,label:'الأحد'},{value:1,label:'الإثنين'},{value:2,label:'الثلاثاء'},{value:3,label:'الأربعاء'},{value:4,label:'الخميس'},{value:5,label:'الجمعة'}];
export const minuteText=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;

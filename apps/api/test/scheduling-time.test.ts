import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { bookingTimes, calendarRange, localCandidates, localInstant, localView, nextStatuses, withinWeekly } from '../src/appointments/scheduling-time.js';
import { SchedulingError } from '../src/appointments/scheduling-error.js';
import { CreateAppointment } from '../src/appointments/scheduling-input.js';
import { permissionsFor } from '../src/auth/permissions.js';
const code=(expected:string)=>(e:unknown)=>e instanceof SchedulingError&&e.code===expected;
test('clinic time conversion is independent of browser/server local timezone',()=>{
  const times=bookingTimes('2027-01-10T09:00','Asia/Aden',30,'REJECT',false);assert.equal(times.startAt.toISOString(),'2027-01-10T06:00:00.000Z');assert.equal(times.endAt.toISOString(),'2027-01-10T06:30:00.000Z');assert.equal(localView(times.startAt,'Asia/Aden').local,'2027-01-10T09:00');
});
test('DST gaps are rejected even if earlier/later is explicitly requested',()=>{
  for(const choice of ['REJECT','EARLIER','LATER'] as const)assert.throws(()=>localInstant('2027-03-14T02:30','America/New_York',choice),code('INVALID_LOCAL_TIME'));
});
test('repeated DST clock time requires explicit selection and yields two distinct instants',()=>{
  assert.throws(()=>localInstant('2026-11-01T01:30','America/New_York'),code('AMBIGUOUS_LOCAL_TIME'));const a=localInstant('2026-11-01T01:30','America/New_York','EARLIER'),b=localInstant('2026-11-01T01:30','America/New_York','LATER');assert.equal(b.getTime()-a.getTime(),3600000);assert.equal(localCandidates('2026-11-01T01:30','America/New_York').length,2);
});
test('clinic-local day ranges correctly span 23/25-hour DST days',()=>{
  for(const [date,next,hours]of [['2027-03-14','2027-03-15',23],['2026-11-01','2026-11-02',25]] as const){const r=calendarRange(date,next,'America/New_York');assert.equal((r.endAt.getTime()-r.startAt.getTime())/3600000,hours);}
  assert.throws(()=>calendarRange('2027-02-30','2027-03-01','UTC'));assert.throws(()=>calendarRange('2027-01-01','2027-03-01','UTC'));assert.throws(()=>calendarRange('2011-12-30','2011-12-31','Pacific/Apia'),code('INVALID_LOCAL_TIME'));
});
test('weekly hours cover real minutes, breaks, repeated hours and midnight correctly',()=>{
  const start=localInstant('2026-11-01T01:30','America/New_York','EARLIER');const end=new Date(start.getTime()+90*60000);assert(withinWeekly(start,end,'America/New_York',[{weekday:7,startMinute:60,endMinute:180}]));assert(!withinWeekly(start,end,'America/New_York',[{weekday:7,startMinute:60,endMinute:90}]));
  const late=localInstant('2027-01-11T23:30','Asia/Aden'),after=new Date(late.getTime()+60*60000);assert(withinWeekly(late,after,'Asia/Aden',[{weekday:1,startMinute:23*60,endMinute:1440},{weekday:2,startMinute:0,endMinute:60}]));
});
test('duration bounds, overflow dates, malformed values and fixed-offset timezones fail safely',()=>{
  for(const duration of [0,4,481,Infinity,2.5])assert.throws(()=>bookingTimes('2027-01-10T09:00','UTC',duration,'REJECT',false));for(const local of ['2027-02-30T10:00','2027-01-01T25:00','2027-01-01T10:00Z'])assert.throws(()=>localInstant(local,'UTC'));assert.throws(()=>localInstant('2027-01-01T10:00','+03:00'),code('INVALID_TIMEZONE'));
});
test('terminal statuses cannot reopen and financial role has no scheduling authority',()=>{
  for(const state of ['COMPLETED','CANCELLED','NO_SHOW'])assert.deepEqual(nextStatuses[state],[]);assert(!permissionsFor('ACCOUNTANT').includes('appointments.read'));assert(!permissionsFor('RECEPTIONIST').includes('appointments.complete'));assert(permissionsFor('RECEPTIONIST').includes('appointments.cancel'));assert(permissionsFor('DOCTOR').includes('appointments.complete'));assert(!permissionsFor('DOCTOR').includes('appointments.cancel'));
});
test('booking DTO requires a random request UUID and rejects oversized/non-numeric duration',async()=>{
  for(const durationMinutes of ['30',481]){const input=plainToInstance(CreateAppointment,{patientId:'bad',serviceId:'bad',doctorResourceId:'bad',bookingKey:'bad',startLocal:'invalid',durationMinutes});assert((await validate(input)).length>0);}
});

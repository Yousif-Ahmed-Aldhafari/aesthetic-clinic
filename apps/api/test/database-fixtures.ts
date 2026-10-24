import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
config({path:resolve(import.meta.dirname,'../../../../.env'),quiet:true});
const development=process.env.DATABASE_URL;
const identity=(url:string)=>{const u=new URL(url);return `${u.hostname}:${u.port||5432}${u.pathname}`;};
export function testUrls() {
  const runtime=process.env.TEST_DATABASE_URL,owner=process.env.TEST_MIGRATION_DATABASE_URL;
  if(!runtime || !owner || !development || identity(runtime)===identity(development) || identity(owner)!==identity(runtime) || new URL(runtime).username===new URL(owner).username)throw new Error('Separate test runtime and maintenance credentials are required');
  return {runtime,owner};
}
export function fixtureDatabase() {
  const {owner}=testUrls();return new PrismaClient({adapter:new PrismaPg({ options: '-c timezone=UTC',connectionString:owner,connectionTimeoutMillis:3000})});
}

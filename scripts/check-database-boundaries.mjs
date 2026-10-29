import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'../apps/api/src');
const errors=[];
async function inspect(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(entry.name==='generated')continue;
    const path=resolve(dir,entry.name);
    if(entry.isDirectory()){await inspect(path);continue;}
    if(!entry.name.endsWith('.ts'))continue;
    const name=relative(root,path).replaceAll('\\','/');
    const source=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true);
    {
      // Metadata writes need the reviewed exclusive tenant lock, validation and
      // trigger-owned audit path. Ledger/audit heads are not application writers.
      const sensitive=new Set(['clinic','clinicBranding','clinicDomain','clinicMembership','clinicAsset','clinicIdentityState','clinicIdentityAuditEvent','clinicSlugReservation','auditEvent']);
      const mutations=new Set(['create','createMany','update','updateMany','upsert','delete','deleteMany']);
      function inspectWrite(node){
        if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
          const operation=node.expression,delegate=operation.expression;
          if(mutations.has(operation.name.text)&&ts.isPropertyAccessExpression(delegate)&&sensitive.has(delegate.name.text)){
            if(delegate.name.text==='auditEvent'&&name!=='prisma/audit.repository.ts')errors.push(`${name}: audit mutation belongs in the audited audit repository boundary`);
            else if(delegate.name.text!=='auditEvent'&&(name!=='prisma/clinic-administration.repository.ts'||['clinicIdentityState','clinicIdentityAuditEvent','clinicSlugReservation'].includes(delegate.name.text)))errors.push(`${name}: clinic identity mutation belongs in the audited administration boundary`);
          }
        }
        ts.forEachChild(node,inspectWrite);
      }
      inspectWrite(source);
    }
    if(name.startsWith('prisma/'))continue;
    function visit(node) {
      if(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)){
        const specifier=node.moduleSpecifier.text;
        const typeOnly=node.importClause?.isTypeOnly || (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.every(e=>e.isTypeOnly));
        if(!typeOnly && (specifier.includes('generated/prisma') || specifier.includes('prisma.service') || ['pg','@prisma/client','@prisma/adapter-pg'].includes(specifier)))errors.push(`${name}: unrestricted database import`);
        if(!typeOnly && specifier.includes('verified-sessions') && name!=='auth/auth.service.ts')errors.push(`${name}: only authentication may mint verified sessions`);
        if(specifier.includes('identity.database') && !name.startsWith('auth/'))errors.push(`${name}: identity infrastructure is restricted to auth`);
      }
      if(ts.isPropertyAccessExpression(node) && ['$queryRaw','$executeRaw','$queryRawUnsafe','$executeRawUnsafe'].includes(node.name.text))errors.push(`${name}: raw SQL belongs in database infrastructure`);
      if(ts.isIdentifier(node) && node.text==='PrismaService')errors.push(`${name}: raw Prisma is private infrastructure`);
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
}
await inspect(root);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.info('Database architectural boundaries passed.');

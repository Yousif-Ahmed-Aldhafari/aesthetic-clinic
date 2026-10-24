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
    if(name.startsWith('prisma/'))continue;
    const source=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true);
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

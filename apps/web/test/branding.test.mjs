import assert from 'node:assert/strict';
import {test} from 'node:test';
import {brandStyle,readableColors,fontFamilies} from '../src/features/settings/branding.ts';
test('branding uses clinic-specific colors, approved Arabic font fallbacks and safe defaults',()=>{
  const a=brandStyle({primaryColor:'#7854D9',secondaryColor:'#F6F8FC',accentColor:null,logoUrl:null,typography:'SYSTEM'}),b=brandStyle({primaryColor:'#087F8C',secondaryColor:'#F0FAF8',accentColor:'#F4A261',logoUrl:null,typography:'NOTO_NASKH'});
  assert.notEqual(a['--clinic-primary'],b['--clinic-primary']);assert.equal(a.fontFamily,fontFamilies.SYSTEM);assert.equal(b.fontFamily,fontFamilies.NOTO_NASKH);assert.equal(brandStyle(null)['--clinic-primary'],'#7854D9');
});
test('branding preview rejects unreadable/invalid colors and accepts legacy light accents with dark foreground',()=>{
  assert(readableColors('#7854D9','#F6F8FC','#A886F3'));assert(readableColors('#087F8C','#F0FAF8','#F4A261'));assert(!readableColors('#FFFFFF','#F6F8FC',null));assert(!readableColors('url(evil)','#FFFFFF',null));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('push worker shows notifications and opens only Connect on tap',async()=>{
 const handlers={},shown=[],opened=[];let focused=false;
 const self={location:{origin:'https://family.example'},addEventListener(name,handler){handlers[name]=handler},registration:{async showNotification(title,options){shown.push({title,options})}},clients:{async matchAll(){return [{url:'https://family.example/',async focus(){focused=true}}]},async openWindow(url){opened.push(url)}}};
 vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL});
 let work;handlers.push({data:{json:()=>({title:'Family update',body:'New check-in',url:'https://attacker.example',tag:'event'})},waitUntil(p){work=p}});await work;assert.equal(shown[0].title,'Family update');assert.equal(shown[0].options.data.url,'https://family.example/');
 handlers.notificationclick({notification:{close(){}},waitUntil(p){work=p}});await work;assert(focused);assert.equal(opened.length,0);
 self.clients.matchAll=async()=>[];handlers.notificationclick({notification:{close(){}},waitUntil(p){work=p}});await work;assert.equal(opened[0],'https://family.example/');
 handlers.push({data:{json(){throw new Error('bad payload')}},waitUntil(p){work=p}});await work;assert.equal(shown[1].title,'Connect');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransferRegister,renameTemplateDepartment} from './transferTemplates.mjs';
import {normalizeState} from '../../store/state.js';

const date='2026-11-11';
const old={id:'paid',date,department:'المشتريات',amount:'1400',status:'transferred',transferredAt:'2026-11-11T09:00:00Z'};
const next={id:'new',name:'دفعة ثانية',date,department:'المشتريات'};

test('register preserves legacy payments and opens a blank independent template for the same day and department',()=>{
  const register=buildTransferRegister([next],[old]);
  assert.equal(register.length,2);
  assert.deepEqual(register.find(x=>x.id==='new').rows,[]);
  assert.deepEqual(register.find(x=>x.id!=='new').rows,[old]);
  assert.deepEqual(buildTransferRegister([next],[old,{id:'draft',templateId:'new',date,department:old.department}]).find(x=>x.id==='new').rows.map(x=>x.id),['draft']);
});

test('renaming an old template keeps it separate from a destination department on the same day',()=>{
  const other={id:'other',date,department:'الصيانة',amount:'500'};
  const register=buildTransferRegister([],[old,other]);
  const source=register.find(x=>x.rows[0].id==='paid');
  const result=renameTemplateDepartment([], [old,other],source,'  الصيانة ');
  const updated=buildTransferRegister(result.supplierTransferTemplates,result.supplierTransfers);
  assert.equal(updated.length,2);
  assert.deepEqual(updated.find(x=>x.id===source.id).rows,[{...old,department:'الصيانة',templateId:source.id}]);
  assert.equal(result.supplierTransfers[1],other);
});

test('normalization keeps an empty saved template and row links after reloading',()=>{
  const state=normalizeState(normalizeState({supplierTransferTemplates:[next,{...next,id:'empty'}],supplierTransfers:[{...old,templateId:'new'}]}));
  assert.equal(state.supplierTransfers[0].templateId,'new');
  assert.deepEqual(buildTransferRegister(state.supplierTransferTemplates,state.supplierTransfers).map(x=>[x.id,x.rows.length]).sort(),[['empty',0],['new',1]]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {renameTransferDepartment} from './transferDepartments.mjs';

const rows=[
  {id:'1',date:'2026-10-08',department:'القديم',supplierNumber:'S1',supplierName:'مورد أول',amount:'1,500',status:'transferred',transferredAt:'2026-10-08T09:00:00Z'},
  {id:'2',date:'2026-10-08',department:'القديم',supplierNumber:'S2',supplierName:'مورد ثان',amount:'200',status:'pending'},
  {id:'3',date:'2026-10-07',department:'القديم',amount:'300'},
  {id:'4',date:'2026-10-08',department:'آخر',amount:'400'}
];

test('renames all selected-day department rows while preserving every other field',()=>{
  const result=renameTransferDepartment(rows,'2026-10-08','القديم','  الجديد  ');
  assert.deepEqual(result,rows.map((row,i)=>i<2?{...row,department:'الجديد'}:row));
  assert.equal(result[2],rows[2]);
  assert.equal(result[3],rows[3]);
  assert.equal(rows[0].department,'القديم');
});

test('empty department cannot erase the saved department',()=>{
  assert.equal(renameTransferDepartment(rows,'2026-10-08','القديم','  '),rows);
});

test('all-departments selection renames the visible day only',()=>{
  const result=renameTransferDepartment(rows,'2026-10-08','','الجديد');
  assert.deepEqual(result,rows.map(row=>row.date==='2026-10-08'?{...row,department:'الجديد'}:row));
});

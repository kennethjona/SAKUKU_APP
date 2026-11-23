import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount, sums, balance, categorySpending, outingSpent, budgetSpent,
  validateTransaction, validateOuting, validateBudget, validateCategory,
  isDate, escapeHTML, nextMonth,
} from '../js/core/finance.js';
import { validateBackup } from '../js/db/indexed-db.js';

const transactions = [
  {id:'a',name:'Uang saku',amount:500000,type:'income',date:'2026-11-01',categoryId:'inc',outingId:null},
  {id:'b',name:'Makan',amount:32000,type:'expense',date:'2026-11-02',categoryId:'food',outingId:'out1'},
  {id:'c',name:'Bensin',amount:13000,type:'expense',date:'2026-11-03',categoryId:'transport',outingId:'out1'},
  {id:'d',name:'Old',amount:70000,type:'expense',date:'2026-10-21',categoryId:'food',outingId:null},
];
const categories = [
  {id:'inc',name:'Gaji',type:'income'}, {id:'food',name:'Makan',type:'expense'},
  {id:'transport',name:'Transportasi',type:'expense'},
];
const outings = [{id:'out1',name:'Nongkrong',date:'2026-11-03',plannedBudget:100000,status:'active'}];

test('Rupiah amounts are integer, no decimals or invalid separators', () => {
  assert.equal(parseAmount('Rp 1.000'),1000);
  assert.equal(parseAmount('25000'),25000);
  assert.equal(parseAmount(25000),25000);
  assert.equal(parseAmount('0'),null);
  assert.equal(parseAmount('0',true),0);
  for (const value of ['1,500','12.50','-100','NaN','','123.0000', '1000000000000']) {
    assert.equal(parseAmount(value),null,`Should reject ${value}`);
  }
});
test('Income/expense/net totals use correct month and balance', () => {
  assert.deepEqual(sums(transactions,'2026-11'),{income:500000,expense:45000,net:455000});
  assert.deepEqual(sums(transactions,'2026-10'),{income:0,expense:70000,net:-70000});
  assert.equal(balance(transactions,100000),485000);
});
test('Category, outing and monthly budget aggregations are consistent', () => {
  assert.deepEqual(categorySpending(transactions,'2026-11'),[
    {categoryId:'food',amount:32000},{categoryId:'transport',amount:13000},
  ]);
  assert.equal(outingSpent(transactions,'out1'),45000);
  assert.equal(budgetSpent(transactions,{month:'2026-11',categoryId:null}),45000);
  assert.equal(budgetSpent(transactions,{month:'2026-11',categoryId:'food'}),32000);
});
test('Transaction requires matching non-archived category and valid date', () => {
  const values = {name:'Transport',amount:'13.000',type:'expense',categoryId:'transport',date:'2026-11-03',description:'',outingId:'out1'};
  assert.equal(validateTransaction(values,{categories,outings}).amount,13000);
  assert.throws(()=>validateTransaction({...values,type:'income'},{categories,outings}),/kategori/i);
  assert.throws(()=>validateTransaction({...values,categoryId:'food'},{categories:[{...categories[1],archived:true}],outings}),/kategori/i);
  assert.throws(()=>validateTransaction({...values,date:'2030-11-03'},{categories,outings}),/masa depan/i);
  assert.throws(()=>validateTransaction({...values,outingId:'missing'},{categories,outings}),/aktivitas/i);
});
test('Validations for activities, budget and categories', () => {
  assert.deepEqual(validateOuting({name:'Jalan',date:'2026-11-03',plannedBudget:'0',note:'',status:'active'}).plannedBudget,0);
  assert.throws(()=>validateOuting({name:'Jalan',date:'bad',plannedBudget:'10',status:'active'}),/tanggal/i);
  assert.equal(validateBudget({month:'2026-11',categoryId:'food',limitAmount:'200000'},categories).limitAmount,200000);
  assert.throws(()=>validateBudget({month:'2026-11',categoryId:'inc',limitAmount:'200000'},categories),/pengeluaran/i);
  assert.throws(()=>validateCategory({name:'Makan',type:'expense'},categories),/sama/i);
});
test('Calendar rollover, genuine date validity and escaping', () => {
  assert.equal(nextMonth('2026-12',1),'2027-01');
  assert.equal(nextMonth('2026-01',-1),'2025-12');
  assert.equal(isDate('2026-02-29'),false);
  assert.equal(isDate('2024-02-29'),true);
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('Backup must be structured and validated before import starts', () => {
  const good={data:{ transactions, categories, budgets:[{id:'2026-11:all',month:'2026-11',limitAmount:600000}],outings,settings:{openingBalance:0,theme:'light'} }};
  assert.equal(validateBackup(good).settings.find(x=>x.key==='openingBalance').value,0);
  assert.throws(()=>validateBackup({...good,data:{...good.data,transactions:[transactions[0],transactions[0]]}}),/duplikat/i);
  assert.throws(()=>validateBackup({...good,data:{...good.data,transactions:[{...transactions[0],amount:-3}]}}),/tidak valid/i);
  assert.throws(()=>validateBackup({...good,data:{...good.data,settings:{openingBalance:-1}}}),/saldo awal/i);
  assert.throws(()=>validateBackup({data:{transactions:[]}}),/categories/i);
});

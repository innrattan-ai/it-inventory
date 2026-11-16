import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPCManagementExportRows,
  filterHardwareComponents,
  applyMasterItemEditPropagation,
  filterTransferMasterItems,
  createEmptyPCAssemblyState,
  getAllocatedItemCountInAssembly,
  addItemToAssemblyTray,
  removeTrayItemToStock,
  assignTrayItemToMotherboardSlot,
  moveMotherboardSlotToSlot,
  unassignMotherboardSlotToTray,
  UNASSIGNED_PC_DEPT_LABEL,
  type MasterItemRecord,
  type PCRecord
} from '../src/utils/pc_and_inventory_helpers';

const sampleItems: MasterItemRecord[] = [
  { id: 'i-psu', item_code: 'PC-101', item_name: 'Corsair CV550 550W PSU', category: 'PC ITEMS', remark: '80+ Bronze' },
  { id: 'i-ssd1', item_code: 'PC-102', item_name: 'Samsung 980 NVMe 500GB', category: 'PC ITEMS', remark: 'OS Boot Drive' },
  { id: 'i-hdd2', item_code: 'PC-103', item_name: 'Seagate Barracuda 2TB HDD', category: 'PC ITEMS', remark: 'Secondary Data Storage' },
  { id: 'i-ram', item_code: 'PC-104', item_name: 'Kingston Fury 8GB DDR4', category: 'PC ITEMS', remark: '3200MHz' },
  { id: 'i-vga', item_code: 'PC-105', item_name: 'NVIDIA GTX 1650 4GB', category: 'PC ITEMS', remark: 'Dual Fan' }
];

test('buildPCManagementExportRows outputs "- belum terpasang" for unassigned PCs and includes Storage 2', () => {
  const pcs: PCRecord[] = [
    {
      id: 'pc-unassigned',
      name: 'PC-SPARE-01',
      chipset: 'Intel B660',
      department: null,
      psu_item_id: 'i-psu',
      storage_item_id: 'i-ssd1',
      storage2_item_id: 'i-hdd2',
      ram1_item_id: 'i-ram',
      ram2_item_id: null,
      ram3_item_id: null,
      vga_item_id: null,
      created_by: 'it@hotel.com',
      created_at: '2026-11-10 09:00:00'
    },
    {
      id: 'pc-fo',
      name: 'PC-FO-01',
      chipset: 'Intel H610',
      department: 'Front Office',
      psu_item_id: 'i-psu',
      storage_item_id: 'i-ssd1',
      storage2_item_id: null,
      ram1_item_id: 'i-ram',
      ram2_item_id: 'i-ram',
      ram3_item_id: null,
      vga_item_id: 'i-vga',
      created_by: 'admin@hotel.com',
      created_at: '2026-11-01 08:30:00'
    }
  ];

  const rows = buildPCManagementExportRows(pcs, sampleItems);
  assert.equal(rows.length, 2);

  // Installed PC comes first when sorted alphabetically before 'zzzz_- belum terpasang'
  assert.equal(rows[0].name, 'PC-FO-01');
  assert.equal(rows[0].department, 'Front Office');
  assert.equal(rows[0].storage1, 'Samsung 980 NVMe 500GB');
  assert.equal(rows[0].storage2, '-');
  assert.equal(rows[0].vga, 'NVIDIA GTX 1650 4GB');

  // Unassigned PC must report '- belum terpasang' as department
  assert.equal(rows[1].name, 'PC-SPARE-01');
  assert.equal(rows[1].department, UNASSIGNED_PC_DEPT_LABEL);
  assert.equal(rows[1].department, '- belum terpasang');
  assert.equal(rows[1].storage1, 'Samsung 980 NVMe 500GB');
  assert.equal(rows[1].storage2, 'Seagate Barracuda 2TB HDD');
});

test('filterHardwareComponents matches item_name, item_code, or remark case-insensitively', () => {
  assert.equal(filterHardwareComponents(sampleItems, '').length, 5);
  assert.equal(filterHardwareComponents(sampleItems, 'seagate')[0].id, 'i-hdd2');
  assert.equal(filterHardwareComponents(sampleItems, 'PC-104')[0].id, 'i-ram');
  assert.equal(filterHardwareComponents(sampleItems, 'bronze')[0].id, 'i-psu');
  assert.equal(filterHardwareComponents(sampleItems, 'nonexistent-part').length, 0);
});

test('applyMasterItemEditPropagation updates masterItems, linked POs, and component movements', () => {
  const mockState = {
    masterItems: sampleItems.map(i => ({ ...i })),
    purchaseOrders: [
      { id: 'po-1', item_id: 'i-ssd1', item_name: 'Samsung 980 NVMe 500GB', photo_url: null },
      { id: 'po-2', item_id: 'i-ram', item_name: 'Kingston Fury 8GB DDR4', photo_url: null }
    ],
    pcComponentMovements: [
      { id: 'cm-1', item_id: 'i-ssd1', item_name: 'Samsung 980 NVMe 500GB' }
    ]
  };

  const updated = applyMasterItemEditPropagation(mockState, 'i-ssd1', {
    item_name: 'Samsung 980 PRO NVMe 1TB',
    remark: 'Upgraded NVMe Gen4',
    photo_url: 'https://cdn.example.com/980pro.jpg',
    updated_by: 'naufal@hotel.com'
  });

  assert.ok(updated);
  assert.equal(updated.item_name, 'Samsung 980 PRO NVMe 1TB');
  assert.equal(updated.remark, 'Upgraded NVMe Gen4');
  assert.equal(updated.photo_url, 'https://cdn.example.com/980pro.jpg');
  assert.equal(mockState.purchaseOrders[0].item_name, 'Samsung 980 PRO NVMe 1TB');
  assert.equal(mockState.purchaseOrders[0].photo_url, 'https://cdn.example.com/980pro.jpg');
  assert.equal(mockState.purchaseOrders[1].item_name, 'Kingston Fury 8GB DDR4');
  assert.equal(mockState.pcComponentMovements[0].item_name, 'Samsung 980 PRO NVMe 1TB');
});

test('filterTransferMasterItems filters by query, category, and available stock', () => {
  const catalog: MasterItemRecord[] = [
    ...sampleItems,
    { id: 'i-net', item_code: 'NET-201', item_name: 'Mikrotik RB3011', category: 'NETWORK ITEMS', remark: 'Core Router' },
    { id: 'i-lock', item_code: 'LCK-301', item_name: 'RFID Door Lock', category: 'LOCK SYSTEM', remark: 'Out of stock' }
  ];
  const stockMap: Record<string, number> = {
    'i-psu': 3,
    'i-ssd1': 0,
    'i-hdd2': 2,
    'i-ram': 4,
    'i-vga': 1,
    'i-net': 5,
    'i-lock': 0
  };
  const getStock = (id: string) => stockMap[id] ?? 0;

  // Filter by category
  const netOnly = filterTransferMasterItems(catalog, { category: 'NETWORK ITEMS' }, getStock);
  assert.equal(netOnly.length, 1);
  assert.equal(netOnly[0].item.id, 'i-net');
  assert.equal(netOnly[0].availableStock, 5);

  // Filter by search + onlyAvailable
  const availSearch = filterTransferMasterItems(catalog, { query: 'samsung', onlyAvailable: true }, getStock);
  assert.equal(availSearch.length, 0); // stock is 0

  const allSearch = filterTransferMasterItems(catalog, { query: 'samsung', onlyAvailable: false }, getStock);
  assert.equal(allSearch.length, 1);
  assert.equal(allSearch[0].availableStock, 0);

  // Available across PC ITEMS
  const availPC = filterTransferMasterItems(catalog, { category: 'PC ITEMS', onlyAvailable: true }, getStock);
  assert.equal(availPC.length, 4);
});

test('Motherboard Drag-and-Drop PC Assembly reserves stock in tray and moves cleanly across slots', () => {
  const assembly = createEmptyPCAssemblyState(true);
  const baseStock = { 'i-psu': 2, 'i-ram': 2, 'i-ssd1': 1 };

  // Add 1 PSU and 2 RAMs to tray (each reserves 1 unit immediately)
  const res1 = addItemToAssemblyTray(assembly, 'i-psu', baseStock['i-psu'] - getAllocatedItemCountInAssembly(assembly, 'i-psu'), 't-psu');
  assert.equal(res1.added, true);
  assert.equal(getAllocatedItemCountInAssembly(assembly, 'i-psu'), 1);

  const res2 = addItemToAssemblyTray(assembly, 'i-ssd1', baseStock['i-ssd1'] - getAllocatedItemCountInAssembly(assembly, 'i-ssd1'), 't-ssd1');
  assert.equal(res2.added, true);
  // Cannot add second i-ssd1 when remaining stock is 0
  const resOver = addItemToAssemblyTray(assembly, 'i-ssd1', baseStock['i-ssd1'] - getAllocatedItemCountInAssembly(assembly, 'i-ssd1'), 't-ssd1-extra');
  assert.equal(resOver.added, false);

  addItemToAssemblyTray(assembly, 'i-ram', 2, 't-ram1');
  addItemToAssemblyTray(assembly, 'i-ram', 1, 't-ram2');
  assert.equal(assembly.tray.length, 4);
  assert.equal(getAllocatedItemCountInAssembly(assembly, 'i-ram'), 2);

  // Drop PSU and RAM1 onto motherboard slots
  assert.equal(assignTrayItemToMotherboardSlot(assembly, 't-psu', 'psu_item_id'), true);
  assert.equal(assignTrayItemToMotherboardSlot(assembly, 't-ram1', 'ram1_item_id'), true);
  assert.equal(assembly.slots.psu_item_id, 'i-psu');
  assert.equal(assembly.slots.ram1_item_id, 'i-ram');
  assert.equal(assembly.tray.length, 2);

  // Dropping RAM2 onto occupied ram1_item_id returns existing item back to tray without losing reservation
  assert.equal(assignTrayItemToMotherboardSlot(assembly, 't-ram2', 'ram1_item_id'), true);
  assert.equal(assembly.slots.ram1_item_id, 'i-ram');
  assert.equal(getAllocatedItemCountInAssembly(assembly, 'i-ram'), 2);

  // Move between slots
  assert.equal(moveMotherboardSlotToSlot(assembly, 'ram1_item_id', 'ram2_item_id'), true);
  assert.equal(assembly.slots.ram1_item_id, null);
  assert.equal(assembly.slots.ram2_item_id, 'i-ram');

  // Unassign slot back to tray, then remove from tray back to stock
  assert.equal(unassignMotherboardSlotToTray(assembly, 'ram2_item_id', 't-ram-back'), true);
  assert.equal(assembly.slots.ram2_item_id, null);
  assert.ok(removeTrayItemToStock(assembly, 't-ram-back'));
  assert.equal(getAllocatedItemCountInAssembly(assembly, 'i-ram'), 1);
});


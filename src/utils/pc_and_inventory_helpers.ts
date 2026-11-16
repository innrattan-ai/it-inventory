export interface MasterItemRecord {
  id: string;
  item_code?: string | null;
  item_name: string;
  category: string;
  remark?: string | null;
  photo_url?: string | null;
  updated_at?: string;
  updated_by?: string;
}

export interface PCRecord {
  id: string;
  name: string;
  chipset: string;
  department?: string | null;
  status?: string;
  psu_item_id?: string | null;
  storage_item_id?: string | null;
  storage2_item_id?: string | null;
  ram1_item_id?: string | null;
  ram2_item_id?: string | null;
  ram3_item_id?: string | null;
  vga_item_id?: string | null;
  created_by?: string;
  created_at?: string;
}

export interface PCExportRow {
  no: number;
  name: string;
  chipset: string;
  department: string;
  status: string;
  psu: string;
  storage1: string;
  storage2: string;
  ram1: string;
  ram2: string;
  ram3: string;
  vga: string;
  created_by: string;
  created_at: string;
}

export const UNASSIGNED_PC_DEPT_LABEL = '- belum terpasang';

export function buildPCManagementExportRows(
  pcs: PCRecord[],
  masterItems: MasterItemRecord[]
): PCExportRow[] {
  const itemById = new Map<string, MasterItemRecord>();
  for (const item of masterItems || []) {
    itemById.set(item.id, item);
  }

  const getCompName = (itemId?: string | null): string => {
    if (!itemId) return '-';
    return itemById.get(itemId)?.item_name || '-';
  };

  // Sort installed PCs alphabetically by department then PC name, followed by unassigned PCs
  const sorted = [...(pcs || [])].sort((a, b) => {
    const deptA = a.department ? a.department.toLowerCase() : 'zzzz_' + UNASSIGNED_PC_DEPT_LABEL;
    const deptB = b.department ? b.department.toLowerCase() : 'zzzz_' + UNASSIGNED_PC_DEPT_LABEL;
    if (deptA !== deptB) return deptA.localeCompare(deptB);
    return (a.name || '').localeCompare(b.name || '');
  });

  return sorted.map((pc, idx) => {
    const hasDept = Boolean(pc.department && String(pc.department).trim() !== '');
    const deptLabel = hasDept ? String(pc.department).trim() : UNASSIGNED_PC_DEPT_LABEL;
    const statusLabel = hasDept ? `Terpasang di ${deptLabel}` : 'Ready in IT Storage (- belum terpasang)';

    return {
      no: idx + 1,
      name: pc.name || '-',
      chipset: pc.chipset || '-',
      department: deptLabel,
      status: statusLabel,
      psu: getCompName(pc.psu_item_id),
      storage1: getCompName(pc.storage_item_id),
      storage2: getCompName(pc.storage2_item_id),
      ram1: getCompName(pc.ram1_item_id),
      ram2: getCompName(pc.ram2_item_id),
      ram3: getCompName(pc.ram3_item_id),
      vga: getCompName(pc.vga_item_id),
      created_by: pc.created_by || '-',
      created_at: pc.created_at || '-'
    };
  });
}

export function filterHardwareComponents<T extends MasterItemRecord>(
  items: T[],
  query: string
): T[] {
  const kw = (query || '').toLowerCase().trim();
  if (!kw) return [...(items || [])];

  return (items || []).filter(item => {
    const nameMatch = (item.item_name || '').toLowerCase().includes(kw);
    const codeMatch = (item.item_code || '').toLowerCase().includes(kw);
    const remarkMatch = (item.remark || '').toLowerCase().includes(kw);
    return nameMatch || codeMatch || remarkMatch;
  });
}

export interface PropagationState {
  masterItems: MasterItemRecord[];
  purchaseOrders?: Array<{ id: string; item_id?: string | null; item_name: string; photo_url?: string | null }>;
  pcComponentMovements?: Array<{ id: string; item_id?: string | null; item_name: string }>;
}

export function applyMasterItemEditPropagation<T extends PropagationState>(
  appState: T,
  itemId: string,
  updates: { item_name: string; remark?: string | null; photo_url?: string | null; updated_by?: string; updated_at?: string }
): MasterItemRecord | null {
  const target = (appState.masterItems || []).find(i => i.id === itemId);
  if (!target) return null;

  target.item_name = updates.item_name;
  target.remark = updates.remark ?? null;
  target.photo_url = updates.photo_url ?? null;
  target.updated_at = updates.updated_at || new Date().toISOString();
  if (updates.updated_by) target.updated_by = updates.updated_by;

  if (Array.isArray(appState.purchaseOrders)) {
    for (const po of appState.purchaseOrders) {
      if (po.item_id === itemId) {
        po.item_name = updates.item_name;
        po.photo_url = updates.photo_url ?? po.photo_url ?? null;
      }
    }
  }

  if (Array.isArray(appState.pcComponentMovements)) {
    for (const cm of appState.pcComponentMovements) {
      if (cm.item_id === itemId) {
        cm.item_name = updates.item_name;
      }
    }
  }

  return target;
}

export interface TransferFilterOptions {
  query?: string;
  category?: string;
  onlyAvailable?: boolean;
}

export interface TransferFilteredItem<T extends MasterItemRecord> {
  item: T;
  availableStock: number;
}

export function filterTransferMasterItems<T extends MasterItemRecord>(
  items: T[],
  options: TransferFilterOptions,
  getAvailableStock: (itemId: string) => number
): Array<TransferFilteredItem<T>> {
  const kw = (options.query || '').toLowerCase().trim();
  const cat = options.category || 'ALL';
  const onlyAvail = Boolean(options.onlyAvailable);

  const results: Array<TransferFilteredItem<T>> = [];
  for (const item of items || []) {
    if (cat !== 'ALL' && item.category !== cat) continue;
    if (kw) {
      const nameMatch = (item.item_name || '').toLowerCase().includes(kw);
      const codeMatch = (item.item_code || '').toLowerCase().includes(kw);
      const remarkMatch = (item.remark || '').toLowerCase().includes(kw);
      const catMatch = (item.category || '').toLowerCase().includes(kw);
      if (!nameMatch && !codeMatch && !remarkMatch && !catMatch) continue;
    }
    const availableStock = Math.max(0, Number(getAvailableStock(item.id)) || 0);
    if (onlyAvail && availableStock <= 0) continue;
    results.push({ item, availableStock });
  }
  return results;
}

export type MotherboardSlotKey =
  | 'psu_item_id'
  | 'storage_item_id'
  | 'storage2_item_id'
  | 'ram1_item_id'
  | 'ram2_item_id'
  | 'ram3_item_id'
  | 'vga_item_id';

export interface TrayItem {
  trayId: string;
  itemId: string;
}

export interface PCAssemblyState {
  active: boolean;
  tray: TrayItem[];
  slots: Record<MotherboardSlotKey, string | null>;
}

export function createEmptyPCAssemblyState(active = false): PCAssemblyState {
  return {
    active,
    tray: [],
    slots: {
      psu_item_id: null,
      storage_item_id: null,
      storage2_item_id: null,
      ram1_item_id: null,
      ram2_item_id: null,
      ram3_item_id: null,
      vga_item_id: null
    }
  };
}

export function getAllocatedItemCountInAssembly(
  assembly: PCAssemblyState | null | undefined,
  itemId: string
): number {
  if (!assembly || !assembly.active || !itemId) return 0;
  let count = 0;
  for (const t of assembly.tray) {
    if (t.itemId === itemId) count += 1;
  }
  for (const val of Object.values(assembly.slots)) {
    if (val === itemId) count += 1;
  }
  return count;
}

export function addItemToAssemblyTray(
  assembly: PCAssemblyState,
  itemId: string,
  remainingAvailableStock: number,
  trayId?: string
): { added: boolean; trayItem?: TrayItem } {
  if (!itemId || remainingAvailableStock <= 0) {
    return { added: false };
  }
  const newTrayItem: TrayItem = {
    trayId: trayId || `tray-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    itemId
  };
  assembly.tray.push(newTrayItem);
  return { added: true, trayItem: newTrayItem };
}

export function removeTrayItemToStock(
  assembly: PCAssemblyState,
  trayId: string
): TrayItem | null {
  const idx = assembly.tray.findIndex(t => t.trayId === trayId);
  if (idx === -1) return null;
  const [removed] = assembly.tray.splice(idx, 1);
  return removed;
}

export function assignTrayItemToMotherboardSlot(
  assembly: PCAssemblyState,
  trayId: string,
  slotKey: MotherboardSlotKey
): boolean {
  const idx = assembly.tray.findIndex(t => t.trayId === trayId);
  if (idx === -1) return false;
  const [picked] = assembly.tray.splice(idx, 1);
  const existingItemId = assembly.slots[slotKey];
  if (existingItemId) {
    assembly.tray.push({
      trayId: `tray-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemId: existingItemId
    });
  }
  assembly.slots[slotKey] = picked.itemId;
  return true;
}

export function moveMotherboardSlotToSlot(
  assembly: PCAssemblyState,
  fromSlot: MotherboardSlotKey,
  toSlot: MotherboardSlotKey
): boolean {
  if (fromSlot === toSlot) return false;
  const sourceItemId = assembly.slots[fromSlot];
  if (!sourceItemId) return false;
  const targetItemId = assembly.slots[toSlot];
  assembly.slots[toSlot] = sourceItemId;
  assembly.slots[fromSlot] = targetItemId || null;
  return true;
}

export function unassignMotherboardSlotToTray(
  assembly: PCAssemblyState,
  slotKey: MotherboardSlotKey,
  trayId?: string
): boolean {
  const currentItemId = assembly.slots[slotKey];
  if (!currentItemId) return false;
  assembly.slots[slotKey] = null;
  assembly.tray.push({
    trayId: trayId || `tray-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    itemId: currentItemId
  });
  return true;
}


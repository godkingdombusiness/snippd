function isoWeekStamp(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function createInitialMission() {
  return {
    weekOf: isoWeekStamp(),
    phase: "plan",
    weeklyBudgetCents: 12000,
    preferredStores: [],
    storeFilterId: null,
    strategiesByStore: null,
    selectedStoreId: "walmart",
    selectedStrategyKey: "budget",
    activeBundle: null,
    shoppingList: [],
    checkout: {
      retailCents: null,
      ibottaFetchCents: null,
      loyaltyCents: null,
    },
    receipt: {
      plannedItems: [],
      actualItems: [],
      unplannedItems: [],
    },
    receiptCount: 0,
    preShopTourLinks: [],
    preShopTourIndex: 0,
    missionHydrated: false,
  };
}

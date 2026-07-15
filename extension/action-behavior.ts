export interface SidePanelBehaviorWriter {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>
}

export async function configureActionPopup(
  sidePanel: SidePanelBehaviorWriter = chrome.sidePanel,
): Promise<void> {
  await sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
}

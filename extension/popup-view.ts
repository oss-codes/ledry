export function updatePickerSelection(
  list: HTMLElement,
  selectedId: number,
): void {
  for (const input of list.querySelectorAll<HTMLInputElement>(
    'input[name="research-tab"]',
  )) {
    const selected = Number(input.value) === selectedId
    input.checked = selected
    const option = input.closest<HTMLElement>(".tab-option")
    if (option !== null) option.dataset["selected"] = String(selected)
  }
}

export function setPickerBusy(list: HTMLElement, busy: boolean): void {
  for (const input of list.querySelectorAll<HTMLInputElement>(
    'input[name="research-tab"]',
  ))
    input.disabled = busy
}

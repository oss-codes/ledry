import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { setPickerBusy, updatePickerSelection } from "../extension/popup-view"

beforeAll(() => GlobalRegistrator.register())
beforeEach(() => {
  document.body.innerHTML = `
    <div id="tabs">
      <label class="tab-option" data-selected="true"><input type="radio" name="research-tab" value="4" checked></label>
      <label class="tab-option" data-selected="false"><input type="radio" name="research-tab" value="8"></label>
    </div>`
})
afterAll(() => GlobalRegistrator.unregister())

describe("popup tab picker DOM", () => {
  test("changes selection without replacing or blurring the focused radio", () => {
    const list = document.querySelector<HTMLElement>("#tabs")
    const second = document.querySelector<HTMLInputElement>('input[value="8"]')
    if (list === null || second === null) throw new Error("missing fixture")
    second.focus()

    updatePickerSelection(list, 8)

    expect(document.activeElement).toBe(second)
    expect(second.checked).toBeTrue()
    expect(second.closest("label")?.dataset["selected"]).toBe("true")
  })

  test("disables every radio while an approval is in flight", () => {
    const list = document.querySelector<HTMLElement>("#tabs")
    if (list === null) throw new Error("missing fixture")

    setPickerBusy(list, true)

    expect(
      [...list.querySelectorAll<HTMLInputElement>("input")].every(
        (input) => input.disabled,
      ),
    ).toBeTrue()
  })
})

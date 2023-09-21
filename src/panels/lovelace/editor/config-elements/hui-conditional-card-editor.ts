import "@material/mwc-list/mwc-list-item";
import "@material/mwc-tab-bar/mwc-tab-bar";
import "@material/mwc-tab/mwc-tab";
import type { MDCTabBarActivatedEvent } from "@material/tab-bar";
import { mdiCodeBraces, mdiContentCopy, mdiListBoxOutline } from "@mdi/js";
import deepClone from "deep-clone-simple";
import { CSSResultGroup, LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import {
  any,
  array,
  assert,
  assign,
  literal,
  number,
  object,
  optional,
  string,
  union,
} from "superstruct";
import { storage } from "../../../../common/decorators/storage";
import { HASSDomEvent, fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/entity/ha-entity-picker";
import "../../../../components/ha-select";
import "../../../../components/ha-textfield";
import type {
  LovelaceCardConfig,
  LovelaceConfig,
} from "../../../../data/lovelace";
import type { HomeAssistant } from "../../../../types";
import type { ConditionalCardConfig } from "../../cards/types";
import "../../common/ha-card-condition-editor";
import type { LovelaceCardEditor } from "../../types";
import "../card-editor/hui-card-element-editor";
import type { HuiCardElementEditor } from "../card-editor/hui-card-element-editor";
import "../card-editor/hui-card-picker";
import "../hui-element-editor";
import type { ConfigChangedEvent } from "../hui-element-editor";
import { baseLovelaceCardConfig } from "../structs/base-card-struct";
import type { GUIModeChangedEvent } from "../types";
import { configElementStyle } from "./config-elements-style";

const stateConditionStruct = object({
  condition: optional(literal("state")),
  entity: string(),
  state: optional(string()),
  state_not: optional(string()),
});

const responsiveConditionStruct = object({
  condition: literal("responsive"),
  max_width: optional(number()),
  min_width: optional(number()),
});

const cardConfigStruct = assign(
  baseLovelaceCardConfig,
  object({
    card: any(),
    conditions: optional(
      array(union([stateConditionStruct, responsiveConditionStruct]))
    ),
  })
);

@customElement("hui-conditional-card-editor")
export class HuiConditionalCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public lovelace?: LovelaceConfig;

  @storage({
    key: "lovelaceClipboard",
    state: false,
    subscribe: false,
    storage: "sessionStorage",
  })
  protected _clipboard?: LovelaceCardConfig;

  @state() private _config?: ConditionalCardConfig;

  @state() private _GUImode = true;

  @state() private _guiModeAvailable? = true;

  @state() private _cardTab = false;

  @query("hui-card-element-editor")
  private _cardEditorEl?: HuiCardElementEditor;

  public setConfig(config: ConditionalCardConfig): void {
    assert(config, cardConfigStruct);
    this._config = config;
  }

  public focusYamlEditor() {
    this._cardEditorEl?.focusYamlEditor();
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const isGuiMode = !this._cardEditorEl || this._GUImode;

    return html`
      <mwc-tab-bar
        .activeIndex=${this._cardTab ? 1 : 0}
        @MDCTabBar:activated=${this._selectTab}
      >
        <mwc-tab
          .label=${this.hass!.localize(
            "ui.panel.lovelace.editor.card.conditional.conditions"
          )}
        ></mwc-tab>
        <mwc-tab
          .label=${this.hass!.localize(
            "ui.panel.lovelace.editor.card.conditional.card"
          )}
        ></mwc-tab>
      </mwc-tab-bar>
      ${this._cardTab
        ? html`
            <div class="card">
              ${this._config.card.type !== undefined
                ? html`
                    <div class="card-options">
                      <ha-icon-button
                        class="gui-mode-button"
                        @click=${this._toggleMode}
                        .disabled=${!this._guiModeAvailable}
                        .label=${this.hass!.localize(
                          isGuiMode
                            ? "ui.panel.lovelace.editor.edit_card.show_code_editor"
                            : "ui.panel.lovelace.editor.edit_card.show_visual_editor"
                        )}
                        .path=${isGuiMode ? mdiCodeBraces : mdiListBoxOutline}
                      ></ha-icon-button>

                      <ha-icon-button
                        .label=${this.hass!.localize(
                          "ui.panel.lovelace.editor.edit_card.copy"
                        )}
                        .path=${mdiContentCopy}
                        @click=${this._handleCopyCard}
                      ></ha-icon-button>
                      <mwc-button @click=${this._handleReplaceCard}
                        >${this.hass!.localize(
                          "ui.panel.lovelace.editor.card.conditional.change_type"
                        )}</mwc-button
                      >
                    </div>
                    <hui-card-element-editor
                      .hass=${this.hass}
                      .value=${this._config.card}
                      .lovelace=${this.lovelace}
                      @config-changed=${this._handleCardChanged}
                      @GUImode-changed=${this._handleGUIModeChanged}
                    ></hui-card-element-editor>
                  `
                : html`
                    <hui-card-picker
                      .hass=${this.hass}
                      .lovelace=${this.lovelace}
                      @config-changed=${this._handleCardPicked}
                    ></hui-card-picker>
                  `}
            </div>
          `
        : html`
            <div class="conditions">
              ${this.hass!.localize(
                "ui.panel.lovelace.editor.card.conditional.condition_explanation"
              )}
              ${this._config.conditions.map(
                (cond, idx) => html`
                  <div class="condition">
                    <ha-card-condition-editor
                      .index=${idx}
                      @value-changed=${this._conditionChanged}
                      .hass=${this.hass}
                      .condition=${cond}
                    ></ha-card-condition-editor>
                  </div>
                `
              )}
              <div class="condition">
                <div class="content">
                  <ha-entity-picker
                    .hass=${this.hass}
                    @change=${this._addCondition}
                  ></ha-entity-picker>
                </div>
              </div>
            </div>
          `}
    `;
  }

  private _selectTab(ev: MDCTabBarActivatedEvent): void {
    this._cardTab = ev.detail.index === 1;
  }

  private _toggleMode(): void {
    this._cardEditorEl?.toggleMode();
  }

  private _setMode(value: boolean): void {
    this._GUImode = value;
    if (this._cardEditorEl) {
      this._cardEditorEl.GUImode = value;
    }
  }

  private _handleGUIModeChanged(ev: HASSDomEvent<GUIModeChangedEvent>): void {
    ev.stopPropagation();
    this._GUImode = ev.detail.guiMode;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
  }

  private _handleCardPicked(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config) {
      return;
    }
    this._setMode(true);
    this._guiModeAvailable = true;
    this._config = { ...this._config, card: ev.detail.config };
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected _handleCopyCard() {
    if (!this._config) {
      return;
    }
    this._clipboard = deepClone(this._config.card);
  }

  private _handleCardChanged(ev: HASSDomEvent<ConfigChangedEvent>): void {
    ev.stopPropagation();
    if (!this._config) {
      return;
    }
    this._config = {
      ...this._config,
      card: ev.detail.config as LovelaceCardConfig,
    };
    this._guiModeAvailable = ev.detail.guiModeAvailable;
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _handleReplaceCard(): void {
    if (!this._config) {
      return;
    }
    // @ts-ignore
    this._config = { ...this._config, card: {} };
    // @ts-ignore
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _addCondition(ev: Event): void {
    const target = ev.target! as any;
    if (target.value === "" || !this._config) {
      return;
    }
    const conditions = [...this._config.conditions];
    conditions.push({
      condition: "state",
      entity: target.value,
      state: "",
    });
    this._config = { ...this._config, conditions };
    target.value = "";
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _conditionChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const conditions = [...this._config!.conditions];
    const newValue = ev.detail.value;
    const index = (ev.target as any).index;

    if (newValue === null) {
      conditions.splice(index, 1);
    } else {
      conditions[index] = newValue;
    }

    this._config = { ...this._config!, conditions };
    fireEvent(this, "config-changed", { config: this._config });
  }

  static get styles(): CSSResultGroup {
    return [
      configElementStyle,
      css`
        mwc-tab-bar {
          border-bottom: 1px solid var(--divider-color);
        }
        .conditions {
          margin-top: 8px;
        }
        .condition {
          margin-top: 8px;
          border: 1px solid var(--divider-color);
        }
        .condition .content {
          padding: 12px;
        }
        .card {
          margin-top: 8px;
          border: 1px solid var(--divider-color);
          padding: 12px;
        }
        @media (max-width: 450px) {
          .card,
          .condition {
            margin: 8px -12px 0;
          }
        }
        .card .card-options {
          display: flex;
          justify-content: flex-end;
          width: 100%;
        }
        .gui-mode-button {
          margin-right: auto;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-conditional-card-editor": HuiConditionalCardEditor;
  }
}

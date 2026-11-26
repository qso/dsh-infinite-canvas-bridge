export const BRIDGE_CSS = `
.icb-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  position: relative;
}

.icb-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  flex-shrink: 0;
  min-height: 36px;
}

.icb-toolbar-left,
.icb-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.icb-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex-shrink: 0;
  background: var(--dsw-alias-label-tertiary);
}

.icb-dot.ok {
  background: var(--dsw-alias-state-success-primary, #16a34a);
  box-shadow: 0 0 0 2px var(--dsw-alias-state-success-tertiary, rgba(22, 163, 74, 0.18));
}

.icb-dot.warn {
  background: var(--dsw-alias-state-warn-primary, #d97706);
}

.icb-dot.err {
  background: var(--dsw-alias-state-error-primary, #dc2626);
}

.icb-title {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.icb-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}

.icb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.icb-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.icb-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.icb-btn.primary {
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #2563eb));
  color: var(--dsw-alias-label-on-color, #ffffff);
}

.icb-btn.primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary, #1d4ed8));
  color: var(--dsw-alias-label-on-color, #ffffff);
}

.icb-btn.outline {
  border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  background: var(--dsw-alias-button-elevated-fill, transparent);
  color: var(--dsw-alias-label-primary);
}

.icb-btn.outline:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.icb-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.icb-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  flex: 1;
  background: transparent;
}

.icb-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}

.icb-card {
  width: 100%;
  max-width: 480px;
  border-radius: 14px;
  border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2));
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1)));
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icb-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.icb-card-desc {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary);
}

.icb-card-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-2));
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.icb-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.icb-settings-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.42));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.icb-settings-modal {
  width: 100%;
  max-width: 460px;
  max-height: 90%;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}

.icb-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.icb-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}

.icb-input,
.icb-select {
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font-size: 12.5px;
}

.icb-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}

.icb-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 220px;
  transition: background 120ms ease, border-color 120ms ease;
}

.icb-chip:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.icb-chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icb-pane-tab-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: inherit;
  white-space: nowrap;
}
`;

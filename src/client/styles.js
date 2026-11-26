export const BRIDGE_CSS = `
.icb-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: var(--dsw-alias-bg-base, #141416);
  color: var(--dsw-alias-text-primary, #e7e7ea);
  font-size: 13px;
  position: relative;
}

.icb-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.2));
  background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, #18181b));
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
  background: var(--dsw-alias-text-tertiary, #888);
}

.icb-dot.ok {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.icb-dot.warn {
  background: #f59e0b;
}

.icb-dot.err {
  background: #ef4444;
}

.icb-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.icb-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.25));
  color: var(--dsw-alias-text-secondary, #a1a1aa);
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
  color: var(--dsw-alias-text-secondary, #a1a1aa);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.icb-btn:hover:not(:disabled) {
  background: var(--dsw-alias-bg-hover, rgba(128, 128, 128, 0.14));
  color: var(--dsw-alias-text-primary, #f4f4f5);
}

.icb-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.icb-btn.primary {
  background: var(--dsw-alias-accent-bg, #3b82f6);
  color: var(--dsw-alias-accent-fg, #ffffff);
}

.icb-btn.primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.icb-btn.outline {
  border-color: var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.28));
  color: var(--dsw-alias-text-primary, #e7e7ea);
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
  border: 1px solid var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.24));
  background: var(--dsw-alias-bg-elevated, rgba(128, 128, 128, 0.06));
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icb-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-text-primary, #f4f4f5);
}

.icb-card-desc {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--dsw-alias-text-secondary, #a1a1aa);
}

.icb-card-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.2));
  color: var(--dsw-alias-text-primary, #e7e7ea);
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
  background: rgba(0, 0, 0, 0.45);
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
  border: 1px solid var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.28));
  background: var(--dsw-alias-bg-base, #18181b);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.36);
}

.icb-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.icb-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-text-secondary, #a1a1aa);
}

.icb-input,
.icb-select {
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.28));
  background: var(--dsw-alias-bg-elevated, rgba(128, 128, 128, 0.08));
  color: var(--dsw-alias-text-primary, #f4f4f5);
  font-size: 12.5px;
}

.icb-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--dsw-alias-text-primary, #e7e7ea);
  cursor: pointer;
}

.icb-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-subtle, rgba(128, 128, 128, 0.25));
  background: transparent;
  color: var(--dsw-alias-text-secondary, #a1a1aa);
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.icb-chip:hover {
  background: var(--dsw-alias-bg-hover, rgba(128, 128, 128, 0.14));
  color: var(--dsw-alias-text-primary, #f4f4f5);
}

.icb-chip.active {
  border-color: rgba(34, 197, 94, 0.4);
  color: var(--dsw-alias-text-primary, #f4f4f5);
}

.icb-pane-tab-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
`;

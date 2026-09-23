# Browser Test Porting Baseline

Reference: `aa26eba`. Keep each JavaScript test title identical to the Python
function name. The manifest failure parameter remains one test named
`test_typechecking_startup_failure_is_visible_and_retryable`.

Shared type-checking defaults are: enabled, standard mode, workspace scope,
autodetect off, MicroPython 1.28.0 esp32 GENERIC stubs. Shared readiness waits
for `#typecheck-tab[data-state=ready]` for 90,000 ms and optionally matches the
selected stub target in the title.

| Python module and test title | Seeded settings | Assertions and explicit waits | Screenshot | Empty console errors |
| --- | --- | --- | --- | --- |
| `test_diagnostics_panel.py::test_mpy_cross_diagnostic_includes_exception_class` | Defaults | mpy-cross diagnostic visible (30,000 ms); exact `SyntaxError` class and message | `mpy-cross-syntax-error.png` | No |
| `test_diagnostics_panel.py::test_diagnostics_panel_filters_jumps_and_run_returns_to_terminal` | Defaults | Ready (90,000 ms); rows visible (30,000 ms); active panel, compact controls, severity filters, jump target, terminal active after Run | `diagnostics-panel.png` | Yes |
| `test_diagnostics_panel.py::test_pyright_diagnostics_are_merged_with_host_linters` | Enabled; open files; autodetect off; esp32 GENERIC | esp32 title (90,000 ms); 5 Pyright rows (30,000 ms); 2 Ruff rows; severity totals, badge/color changes (30,000 ms), messages and 2 editor error ranges | `diagnostics-panel-pyright.png` | No |
| `test_diagnostics_panel.py::test_typechecking_scope_includes_unopened_files_and_opens_them_from_diagnostics` | Enabled; workspace | Ready (90,000 ms); unopened row appears (30,000 ms), disappears in open-files scope (30,000 ms), reappears in workspace scope (30,000 ms); diagnostic opens file and active line | `diagnostics-unopened-workspace-file.png` | Yes |
| `test_typechecking_settings.py::test_typechecking_autodetects_connected_vm` | Enabled | Ready and webassembly title (90,000 ms); detected family/port/board/package; selectors disabled; disabling autodetect enables selectors and persists both values | `typechecking-autodetect-vm.png` | Yes |
| `test_typechecking_settings.py::test_catalog_only_stub_port_can_switch_without_deadlock` | Enabled; autodetect off; MicroPython 1.28.0 esp32 GENERIC | Ready (90,000 ms); switch to esp8266 and back; each title/package update waits 90,000 ms; port remains enabled | `typechecking-catalog-port-switch.png` | Yes |
| `test_typechecking_settings.py::test_typechecking_mode_and_stub_selection_persist` | Once per session: enabled; autodetect off | Ready (90,000 ms); default mode/scope/stubs and advanced visibility; strict/rp2/RPI_PICO_W updates (90,000 ms); localStorage and reload persistence; diagnostics badge nonempty (30,000 ms); basic mode returns ready (90,000 ms) | `typechecking-settings-basic-rp2.png` | Yes |
| `test_typechecking_settings.py::test_typechecking_stub_packages_install_and_persist` | Enabled; advanced mode | Ready (90,000 ms); install and persisted `types-requests` status (90,000 ms); clear status (90,000 ms); disabled controls and guidance when type checking is off | `typechecking-persistent-stub-package.png` | No |
| `test_typechecking_status.py::test_typechecking_status_can_disable_and_restore_pyright` | Defaults | Ready (90,000 ms); editor visible; no legacy status; disable state/localStorage; re-enable and ready (90,000 ms); no component logs | `typechecking-status-ready.png` | Yes |
| `test_typechecking_workflows.py::test_typechecking_startup_failure_is_visible_and_retryable` (`manifest-http-error`: manifest request returns 503) | Shared defaults | Error (45,000 ms); retry guidance; enabled control; editor visible (30,000 ms); request intercepted; disable/enable recovery and esp32 ready title (90,000 ms) | `typechecking-startup-manifest-error.png`, `typechecking-startup-manifest-recovered.png` | Captured, not asserted |
| `test_typechecking_workflows.py::test_local_imports_follow_changes_across_open_tabs` | Shared defaults; open files | Ready (90,000 ms); consumer has one assignability diagnostic (30,000 ms), no unresolved import; helper edit clears it (30,000 ms); content and ready state preserved | `typechecking-local-multi-tab-imports.png` | Yes |
| `test_typechecking_workflows.py::test_dotted_completion_opens_on_every_first_trigger` | Shared defaults; open files; webassembly | Webassembly ready (90,000 ms); on each of five 30 ms sequential `t.` entries completion opens (15,000 ms), contains `sleep`, and closes on Escape | `typechecking-dotted-autocomplete.png` | Yes |
| `test_typechecking_workflows.py::test_fast_tab_switching_keeps_content_and_diagnostics_with_their_files` | Shared defaults; open files | Ready (90,000 ms); one row per file (30,000 ms); after 25 rapid switches active tab/content are correct; fixing A clears only A (30,000 ms); B content and ready state remain | `typechecking-fast-tab-switching.png` | Yes |
| `test_typechecking_workflows.py::test_stub_port_changes_reanalyze_open_files` | Shared defaults; open files | Ready (90,000 ms); unresolved `rp2` row appears (30,000 ms); rp2 title (90,000 ms) clears it (30,000 ms); esp32 title (90,000 ms) restores it (30,000 ms); content preserved | `typechecking-rp2-stubs-resolve-import.png` | Yes |

Baseline totals: 14 tests, one parametrized case, 15 distinct screenshot files,
and 10 empty-console assertions.
; Npcap can't be redistributed, so the installer only points to it when it's missing.
; 64-bit Windows: a 32-bit installer sees System32 through Sysnative.
!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$WINDIR\Sysnative\wpcap.dll" daevalog_npcap_ok
  IfFileExists "$WINDIR\System32\wpcap.dll" daevalog_npcap_ok
  MessageBox MB_YESNO|MB_ICONINFORMATION "Daevalog needs Npcap to read the game's traffic.$\r$\n$\r$\nInstall 64-bit Npcap with $\"WinPcap API-compatible Mode$\" ticked, then start Daevalog.$\r$\n$\r$\nOpen the Npcap download page now?" /SD IDNO IDNO daevalog_npcap_ok
  ExecShell "open" "https://npcap.com/#download"
  daevalog_npcap_ok:
!macroend

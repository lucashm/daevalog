; Npcap can't be redistributed (that needs Npcap OEM), so when it's missing the
; installer downloads the official installer from npcap.com and runs it: the user
; goes through Npcap's own setup and license, and Windows asks for admin rights.
;
; To move to a newer Npcap: set the version, download npcap-<version>.exe from
; npcap.com/dist, check Get-AuthenticodeSignature says Valid and "O=Nmap Software
; LLC", and put its SHA-256 (Get-FileHash) here. npcap.com publishes no hashes.
!define NPCAP_VERSION "1.90"
!define NPCAP_URL "https://npcap.com/dist/npcap-${NPCAP_VERSION}.exe"
!define NPCAP_SHA256 "682B57E1C05EF375931975C9D6DED40888F4BFDF9F4B11571E654F962F1199B6"
!define NPCAP_FILE "$TEMP\daevalog-npcap-${NPCAP_VERSION}.exe"

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  ; 64-bit Windows: a 32-bit installer sees System32 through Sysnative.
  IfFileExists "$WINDIR\Sysnative\wpcap.dll" daevalog_npcap_done
  IfFileExists "$WINDIR\System32\wpcap.dll" daevalog_npcap_done
  MessageBox MB_YESNO|MB_ICONQUESTION "Daevalog needs Npcap to read the game's traffic, and it isn't installed.$\r$\n$\r$\nDownload Npcap ${NPCAP_VERSION} from npcap.com and install it now? Windows will ask for administrator permission; keep $\"WinPcap API-compatible Mode$\" ticked." /SD IDNO IDNO daevalog_npcap_done
  DetailPrint "Downloading Npcap ${NPCAP_VERSION} from npcap.com..."
  ; Windows' own PowerShell: NSIS's download plugin can't do HTTPS. Exit 0 only for the expected file.
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$ErrorActionPreference='Stop'; $$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $$f='${NPCAP_FILE}'; Invoke-WebRequest -UseBasicParsing '${NPCAP_URL}' -OutFile $$f; if ((Get-FileHash $$f -Algorithm SHA256).Hash -ne '${NPCAP_SHA256}') { Remove-Item $$f; Write-Output 'Npcap download did not match the expected file.'; exit 3 }"`
  Pop $0
  StrCmp $0 "0" 0 daevalog_npcap_failed
  DetailPrint "Running the Npcap installer..."
  ExecShellWait "open" "${NPCAP_FILE}" "/winpcap_mode=yes"
  Goto daevalog_npcap_done
  daevalog_npcap_failed:
  DetailPrint "Npcap download failed ($0)."
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "Npcap couldn't be downloaded.$\r$\n$\r$\nOpen the Npcap download page instead? Install 64-bit Npcap with $\"WinPcap API-compatible Mode$\" ticked, then start Daevalog." /SD IDNO IDNO daevalog_npcap_done
  ExecShell "open" "https://npcap.com/#download"
  daevalog_npcap_done:
  Pop $0
!macroend

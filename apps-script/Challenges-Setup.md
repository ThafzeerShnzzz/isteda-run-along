# Run Along challenge uploads

The challenge page and offline PDF are available independently of the submission service.

1. Create a separate Google Apps Script project using `ChallengeUploads.gs`.
2. In Project Settings, add script properties `SPREADSHEET_ID`, `REGISTRATION_TAB`, `WHATSAPP_COLUMN` (one-based), and `PHOTO_FOLDER_ID`. Use the existing registrations workbook and a restricted Google Drive folder. Keep both private.
3. Deploy as a web app. Run as the owner and allow anyone to access the web app URL so attendees do not need Google accounts.
4. In `challenge-config.json`, set `submissionUrl` to the new deployment's `/exec` URL.
5. Test a registered number, an unregistered number, an armband upload, and a task upload. Check both review tabs and confirm the Drive links are restricted.

The service matches the entered number against the registration tab. Organizers review the armband and task photos in the private workbook. Use Approved or Rejected in the Review column. A rejected task can be uploaded again. The number is a registration lookup and the armband is reviewed by the organizer. Release prizes only after checking both.

Edit `challenge-questions.json` to change the website and the downloadable PDF together. Keep task IDs stable after launch. New IDs follow the existing format, such as L1-02 or OPEN-03.

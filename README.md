# Amrabad Tiger Reserve – Employee Database

**Website:** https://atrdbms.github.io/atr-employee/ (GitHub Pages, this repository)
**Data:** the "Employee data" Google Sheet, read and written through a small Google Apps Script "data service".

GitHub Pages can only host pages; it cannot write to Google Sheets. The Apps Script service does the
reading and writing, and it also summarises the M-STrIPES "Patrol details" sheet for each officer.

## What the website does
1. **Choose a category**: Regular or Outsourcing (taken from the `categries` tab).
2. **Dashboard & Reports**: summary tiles, charts (designation, range, division, place of working),
   Designation × Division and Designation × Range reports, and posts listed vs employees entered.
3. **M-STrIPES link** (matched on Name + Designation, with FBO = Forest Beat Officer, FSO, FRO, DyRO):
   patrols, days, km, observations and last patrol date for each employee, plus a list of officers who appear
   in M-STrIPES but are not yet in the employee database, each with an **Add** button.
4. **Employee Records**: the same columns as the `employee data` tab, plus an M-STrIPES column. You can filter by
   Designation, Place of working, District, Division, Range, Section, Beat, Basecamp, Scheme and M-STrIPES link, and search.
   You can also edit, delete, export to Excel (CSV), export an M-STrIPES staff list, and print.
5. **Add Employee**: the dropdowns come from the `categries` tab. Typing a name suggests M-STrIPES officers and fills
   in the Designation and Range. A photo is saved to Google Drive, and the row is written to the sheet with the next ID No.

## One-time step: deploy the data service (about 5 minutes)
1. Sign in to Google with an account that can **edit** the Employee data sheet and **view** the M-STrIPES
   "Petrol details" sheet. Open https://script.google.com and click **New project**. Name it "ATR Employee Database".
2. Delete what is in `Code.gs` and paste in the contents of **`apps-script/Code.gs`** from the repository.
   *(Optional)* To protect staff mobile and EPF numbers, type a passcode between the quotes in `const PASSCODE = '';`.
3. Click **Save**, then **Deploy → New deployment**. Click the gear icon and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone** (this is needed for the GitHub page to reach it)
4. Click **Deploy**, then **Authorize access** and allow Sheets and Drive.
   Copy the **Web app URL**, which ends in `/exec`.
5. Send that URL to Claude, or put it into the site yourself: on GitHub open `index.html`, click the pencil icon,
   find `const API_URL = '';`, paste the URL between the quotes, and click **Commit changes**.
   The website goes live about a minute later.

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.
This keeps the URL the same.

## Notes
- Keep the header names in row 1 of the sheet the same. New posts added to `categries` show up in the dropdowns automatically.
- The M-STrIPES summary is cached for 6 hours. Use **Refresh data** to reload the employee data.
- Privacy: the Employee data sheet is currently shared as "Anyone with the link can **edit**". After the data service is
  deployed, you can set the sheet to **Restricted**. The website keeps working because the service runs as your account.
  With "Who has access: Anyone", anyone who has the service URL can read the data unless you set a PASSCODE.

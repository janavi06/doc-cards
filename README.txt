DOCTOR DIRECTORY — CURRENT VERSION

Open index.html in a browser. To connect live records:
1. Put approved directory data in a Google Sheet and enable link viewing for this static version.
2. Set SHEET_ID and GID in config.js.
3. Use the visible UI fields: S.No, Doctor Name, Department, Designation, Educational Qualification, Institution, Year, Exp (In Yrs), Working at (Hospital 1), City (1)/(2), Branch (1)/(2), Branch Profile Page URL, and Count.
4. Optional columns supported by the app: Source, Source Link, Contact/Phone/Mobile, and Photo/Image.

LAYOUT AND DATA
- Preserves one doctor per card and places appointment/shortlist actions below the education table, leaving a wider education column.
- Uses a white page and cards with a restrained blue palette and gray search/filter controls.
- Search starts the page; the result-count bar, repeated designation under each name, and department badge under each name are removed.
- Portrait sits above the name; a valid Photo/Image URL from the sheet replaces the illustrated sample portrait.
- Branches and qualifications use wrapping text and scroll vertically when there are more than four rows; long values are not shortened with ellipses.
- Source and Source Link appear under working details when those columns contain values.
- Actual phone values from the Contact, Phone, or Mobile column display as a tap-to-call contact and appointment button.
- The first preview card uses the doctor and row data visible in the supplied sheet screenshot. Ten additional fictional sample doctors cover varied specialties, one to six branches, and one to five qualifications. No sample phone numbers are shown; the appointment button explains that a verified number is needed.
- Search/filtering and page sizes of 25, 50, or 100 remain available. Only the current page is rendered.

10,000+ DOCTOR CAPACITY
The page renders one page at a time and filters an in-memory index. It still downloads the full Google Sheet to each visitor's browser. For higher traffic, private data, or larger data growth, move the records to a backend API and database with server-side search and pagination. Do not place private information in a publicly viewable sheet.

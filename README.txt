HUMANEX ScanRx
================

This browser first research prototype is built with HTML, CSS and JavaScript and is compatible with GitHub Pages.

What was corrected
------------------
1. ScanRx now opens directly to a clean scanner interface.
2. The initial scanner never shows a previous result or result card.
3. The scanner is mobile first and prevents horizontal page overflow.
4. The camera uses navigator.mediaDevices.getUserMedia() with the rear camera preferred.
5. SCAN NOW opens the live camera; CAPTURE takes a real frame and stops the camera.
6. Uploaded images follow the same real OCR verification path.
7. OCR uses Tesseract.js with original, grayscale and high contrast preprocessing passes.
8. OCR attempts to extract NAFDAC registration numbers from the actual package image.
9. Verification is based on a matching reference record, not a random dataset item.
10. Manual NAFDAC registration lookup is synchronous and does not show an endless search spinner.
11. A missing match produces NOT VERIFIED and does not claim that the physical product is counterfeit.
12. The NAFDAC reporting action points to the official Greenbook reporting form.
13. All project paths are relative so the site works under:
    https://odeleyeemmanuel.github.io/HUMANEX-ScanRx/

Reference database
------------------
The supplied compressed reference PDFs were imported into data.js.

Records currently included:
- Existing project reference records: 99
- CDCL 2019: 5120
- CDCL 2020: 4452
- CDCL 2021: 3614
- NAFDAC approved pesticides reference PDF: 496
- Total deduplicated records: 13781

Important dataset note
----------------------
The CDCL PDFs are lists of products analysed in 2019, 2020 and 2021. The pesticide PDF is a supplied historical reference list.
These records are not treated as a live NAFDAC database and the application does not claim that a historical record proves current regulatory status.

GitHub Pages
------------
Deploy the contents of this folder to the repository:
HUMANEX-ScanRx

Project URL:
https://odeleyeemmanuel.github.io/HUMANEX-ScanRx/

Camera access requires HTTPS and a browser that supports getUserMedia().
Upload and manual registration lookup remain available if camera access is unavailable.

Files
-----
index.html
scan.html
styles.css
scan.js
data.js
app.js
robots.txt
sitemap.xml
.nojekyll
README.txt

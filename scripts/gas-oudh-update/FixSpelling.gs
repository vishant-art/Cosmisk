/**
 * Fix "Oudh Arabia" → "Oud Arabia" across all 6 Google Docs.
 * Run this function from Apps Script editor.
 */
function fixOudSpelling() {
  var docs = [
    {id: '12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM', name: 'C1'},
    {id: '17EB11DvKGMUY7yaVEOrdkvyFChA_clvK8dZHir5dU1E', name: 'C2'},
    {id: '1Fi3OJZ1QUJ6b9LGE4v-P2GQ-dbMqXW4cu-r3Ds8nkRk', name: 'C3'},
    {id: '1qk2EN0O2hGfgsojh5XjpWMC65_Q_XXuls_9baPvDRO0', name: 'C4'},
    {id: '1msUH7QbK4kRu49NwUq0JoZquOBFtZqZXeAZZqUQM8NQ', name: 'C5'},
    {id: '1YalRtQ1kcoPHiFW-TznsQCD01fcMgSaPYmRNgz0-Tw8', name: 'C6'},
  ];

  var results = [];
  for (var i = 0; i < docs.length; i++) {
    var doc = DocumentApp.openById(docs[i].id);
    var body = doc.getBody();
    var count = 0;

    while (body.findText('[Oo]udh Arabia')) {
      body.replaceText('[Oo]udh Arabia', 'Oud Arabia');
      count++;
      if (count > 50) break;
    }

    while (body.findText('OUDH ARABIA')) {
      body.replaceText('OUDH ARABIA', 'OUD ARABIA');
      count++;
      if (count > 50) break;
    }

    doc.saveAndClose();
    results.push(docs[i].name + ': ' + count + ' fixes');
    Logger.log(docs[i].name + ': ' + count + ' fixes');
  }

  Logger.log('DONE: ' + results.join(', '));
  return results.join('\n');
}

/**
 * Extract reference videos from concept deck and add to script docs.
 * Concept deck → Script mapping:
 *   Concept 1 (Car Testimonial, Dagger) → C1
 *   Concept 2 (Scarcity, Dagger) → C2
 *   Concept 4 (Educational, Dakhoon) → C3
 *   Concept 5 (Recommendation, Dakhoon) → C4
 *   Concept 7 (Comparison, JEZ) → C5
 *   Concept 8 (Review, VotS) → C6
 */
function addReferenceVideos() {
  var DECK_ID = '18IPegomV9uNiLHCE_0VEuw7hWhI9K2Aeos7cTYEu4r8';

  // Concept slide index (0-based) → script doc mapping
  // Slide 0 = title, Slide 1 = brief, Slide 2 = Concept 1, etc.
  var conceptMap = [
    {slideIndex: 2, conceptNum: 1, scriptName: 'C1', docId: '12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM',
     conceptTitle: 'Car Testimonial', conceptTheme: "Don't compromise on luxury. Especially scents.", product: 'Dagger Attar'},
    {slideIndex: 3, conceptNum: 2, scriptName: 'C2', docId: '17EB11DvKGMUY7yaVEOrdkvyFChA_clvK8dZHir5dU1E',
     conceptTitle: 'Scarcity Angle', conceptTheme: 'Exclusivity', product: 'Dagger Attar'},
    {slideIndex: 5, conceptNum: 4, scriptName: 'C3', docId: '1Fi3OJZ1QUJ6b9LGE4v-P2GQ-dbMqXW4cu-r3Ds8nkRk',
     conceptTitle: 'Educational', conceptTheme: 'Authority & taste', product: 'Dakhoon Perfume'},
    {slideIndex: 6, conceptNum: 5, scriptName: 'C4', docId: '1qk2EN0O2hGfgsojh5XjpWMC65_Q_XXuls_9baPvDRO0',
     conceptTitle: 'Recommendation', conceptTheme: 'Trusted discovery', product: 'Dakhoon Perfume'},
    {slideIndex: 8, conceptNum: 7, scriptName: 'C5', docId: '1msUH7QbK4kRu49NwUq0JoZquOBFtZqZXeAZZqUQM8NQ',
     conceptTitle: 'Comparison', conceptTheme: 'High Standards and not settling for less', product: 'Jannat E Zuhur'},
    {slideIndex: 9, conceptNum: 8, scriptName: 'C6', docId: '1YalRtQ1kcoPHiFW-TznsQCD01fcMgSaPYmRNgz0-Tw8',
     conceptTitle: 'Review / Testimonial', conceptTheme: 'Honest opinion', product: 'Voice of the Soul'},
  ];

  var presentation = SlidesApp.openById(DECK_ID);
  var slides = presentation.getSlides();

  var results = [];

  for (var i = 0; i < conceptMap.length; i++) {
    var mapping = conceptMap[i];
    var slide = slides[mapping.slideIndex];
    if (!slide) {
      results.push(mapping.scriptName + ': slide not found (index ' + mapping.slideIndex + ')');
      continue;
    }

    // Extract video URLs and image links from the slide
    var videoUrls = [];
    var elements = slide.getPageElements();

    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];

      // Check for video elements
      if (el.getPageElementType() === SlidesApp.PageElementType.VIDEO) {
        var video = el.asVideo();
        var url = video.getUrl();
        if (url) videoUrls.push(url);
      }

      // Check for images with links (video thumbnails linked to source)
      if (el.getPageElementType() === SlidesApp.PageElementType.IMAGE) {
        try {
          var imgLink = el.asImage().getLink();
          if (imgLink && imgLink.getUrl()) {
            var linkUrl = imgLink.getUrl();
            if (linkUrl.indexOf('instagram.com') !== -1 ||
                linkUrl.indexOf('youtube.com') !== -1 ||
                linkUrl.indexOf('youtu.be') !== -1 ||
                linkUrl.indexOf('vimeo.com') !== -1 ||
                linkUrl.indexOf('drive.google.com') !== -1 ||
                linkUrl.indexOf('tiktok.com') !== -1) {
              videoUrls.push(linkUrl);
            }
          }
        } catch(e) {}
      }

      // Check for shapes with links
      if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        try {
          var shapeLink = el.asShape().getLink();
          if (shapeLink && shapeLink.getUrl()) {
            var sUrl = shapeLink.getUrl();
            if (sUrl.indexOf('instagram.com') !== -1 ||
                sUrl.indexOf('youtube.com') !== -1 ||
                sUrl.indexOf('youtu.be') !== -1 ||
                sUrl.indexOf('drive.google.com') !== -1) {
              videoUrls.push(sUrl);
            }
          }
        } catch(e) {}
      }
    }

    // Also check text content for URLs
    var textElements = slide.getPageElements();
    for (var k = 0; k < textElements.length; k++) {
      var te = textElements[k];
      if (te.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        try {
          var text = te.asShape().getText().asString();
          // Find Instagram URLs
          var igMatch = text.match(/https?:\/\/(?:www\.)?instagram\.com\/reel\/[^\s)]+/g);
          if (igMatch) {
            for (var m = 0; m < igMatch.length; m++) videoUrls.push(igMatch[m]);
          }
          // Find YouTube URLs
          var ytMatch = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s)]+/g);
          if (ytMatch) {
            for (var m = 0; m < ytMatch.length; m++) videoUrls.push(ytMatch[m]);
          }
        } catch(e) {}
      }
    }

    // Deduplicate
    var unique = [];
    var seen = {};
    for (var u = 0; u < videoUrls.length; u++) {
      var clean = videoUrls[u].replace(/\?.*$/, ''); // strip query params for dedup
      if (!seen[clean]) {
        seen[clean] = true;
        unique.push(videoUrls[u]);
      }
    }

    if (unique.length === 0) {
      results.push(mapping.scriptName + ' (Concept ' + mapping.conceptNum + '): no reference video found');
      continue;
    }

    // Add concept header + reference video to the script doc
    var doc = DocumentApp.openById(mapping.docId);
    var body = doc.getBody();

    // Add concept name at the TOP of the doc (if not already there)
    if (!body.findText('Based on Concept')) {
      var conceptHeader = body.insertParagraph(0, 'Based on Concept ' + mapping.conceptNum + ': ' + mapping.conceptTitle);
      conceptHeader.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      conceptHeader.setBold(true);
      conceptHeader.setForegroundColor('#4A148C');

      var conceptDetails = body.insertParagraph(1, 'Product: ' + mapping.product + '  |  Theme: ' + mapping.conceptTheme);
      conceptDetails.setForegroundColor('#666666');
      conceptDetails.setFontSize(10);

      body.insertParagraph(2, '');
    }

    // Add reference video section at the bottom (if not already there)
    if (body.findText('REFERENCE VIDEO FROM CONCEPT DECK')) {
      results.push(mapping.scriptName + ' (Concept ' + mapping.conceptNum + '): concept header added, reference video already exists');
      doc.saveAndClose();
      continue;
    }

    if (unique.length > 0) {
      body.appendParagraph('');
      var refHeader = body.appendParagraph('REFERENCE VIDEO FROM CONCEPT DECK');
      refHeader.setHeading(DocumentApp.ParagraphHeading.HEADING3);
      refHeader.setBold(true);

      body.appendParagraph('Use this as visual direction for the shoot. Match the energy and framing, but adapt to our production setup (2 locations: Oud Arabia Mumbai store + Airbnb, 2 creators: Ferial + Divyansh).');

      for (var v = 0; v < unique.length; v++) {
        var linkPara = body.appendParagraph(unique[v]);
        linkPara.setLinkUrl(unique[v]);
      }

      body.appendParagraph('NOTE: Keep within our constraints — no outdoor/poolside, dark moody interiors, male creators primary.');
      body.appendParagraph('');
    }

    doc.saveAndClose();
    results.push(mapping.scriptName + ' (Concept ' + mapping.conceptNum + '): added ' + unique.length + ' reference(s) — ' + unique.join(', '));
    Logger.log(results[results.length - 1]);
  }

  Logger.log('=== RESULTS ===');
  for (var r = 0; r < results.length; r++) Logger.log(results[r]);
  return results.join('\n');
}

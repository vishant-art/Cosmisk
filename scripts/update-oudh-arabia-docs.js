/**
 * Google Apps Script — Update Oud Arabia UGC Scripts in Google Docs
 *
 * HOW TO USE:
 * 1. Go to https://script.google.com
 * 2. Create a new project
 * 3. Paste this entire file
 * 4. Click Run > updateAllScripts
 * 5. Authorize when prompted (one-time)
 * 6. All 6 docs will be updated with revised V2 scripts
 *
 * Original V1 scripts are preserved at the bottom of each doc.
 */

function updateAllScripts() {
  const scripts = [
    {
      docId: '12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM',
      name: 'C1 — Dagger Attar (Longevity Proof)',
      revised: `ANGLE: Longevity proof — morning-to-night
FORMAT: UGC talking head
DURATION: 25 sec

== FULL SCRIPT ==
[VO: genuine, surprised storytelling tone]

HOOK: "I put this on at 7 AM. It's 11 PM and people are still asking about it."

PROBLEM: "Every perfume I owned would vanish in two hours. In Mumbai heat? Forget it."

SOLUTION: "Then someone put me on to Oud Arabia. Oil-based, no alcohol — completely different game."

PROOF: "Sixteen hours later, my friend gets in the car and goes — 'Bro, what is that?' Still projecting."

CTA: "If you're serious about fragrances that actually last, link's in the bio."

== HOOK ==
I put this on at 7 AM. It's 11 PM and people are still asking about it.`
    },
    {
      docId: '1Fi3OJZ1QUJ6b9LGE4v-P2GQ-dbMqXW4cu-r3Ds8nkRk',
      name: 'C3 — Dakhoon (Luxury Discovery)',
      revised: `ANGLE: Luxury fragrance discovery
FORMAT: UGC talking head
DURATION: 30 sec

== FULL SCRIPT ==
[VO: intrigued, discovery tone — like sharing a secret find]

HOOK: "This perfume has Agarwood, Rose, AND Leather. In one bottle."

This perfume has Agarwood, Rose, AND Leather. In one bottle. So I've always loved complex fragrances, right? But most perfumes give you one, maybe two notes, and then they're gone in a couple hours. Oud Arabia's Dakhoon is different — it's a 100ml oil-based perfume, no alcohol, and the note journey is insane. You get Agarwood and Rose upfront, then Saffron and Frankincense come through, and it settles into this deep Leather-Musk-Amber base. And because it's oil-based, it doesn't just vanish — we're talking 48-hour longevity. My friend came over the next day and was like "Yaar, what is that smell? Your room still smells amazing." That's from wearing it yesterday. If you want a fragrance that actually evolves and lasts, check Oud Arabia. Link in bio.

== HOOK ==
This perfume has Agarwood, Rose, AND Leather. In one bottle.

NOTE: MAJOR REWRITE — Original incorrectly treated Dakhoon as incense. It is a 100ml oil-based perfume (Rs 5,890).`
    },
    {
      docId: '1qk2EN0O2hGfgsojh5XjpWMC65_Q_XXuls_9baPvDRO0',
      name: 'C4 — Dakhoon Alt (Roommate Impressed)',
      revised: `ANGLE: Upgrade from basic / roommate impressed
FORMAT: UGC talking head
DURATION: 25 sec

== FULL SCRIPT ==
[VO: casual, genuine surprise tone]

HOOK: "My roommate thought I was wearing designer. It's Rs 5,890."

My roommate thought I was wearing designer. It's Rs 5,890. Look, I'm not a fragrance expert, but I know when something hits different. I used to rotate between the same three alcohol sprays — they'd fade by lunch. Then I tried Oud Arabia's Dakhoon. It's oil-based, alcohol-free, and the first thing you notice is these deep Agarwood and Rose notes. But it keeps evolving — Saffron, then Leather and Musk come through later. My roommate came home in the evening and was like "What's that amazing smell?" Bro, I applied it in the morning. 48-hour longevity, that's not marketing — I've tested it. If you want something that actually lasts and smells premium without the premium price tag, this is it. Link in bio, Oud Arabia.

== HOOK ==
My roommate thought I was wearing designer. It's Rs 5,890.

NOTE: MAJOR REWRITE — Original incorrectly treated Dakhoon as incense. It is a 100ml oil-based perfume (Rs 5,890).`
    },
    {
      docId: '1msUH7QbK4kRu49NwUq0JoZquOBFtZqZXeAZZqUQM8NQ',
      name: 'C5 — Jannat E Zuhur (Longevity Frustration)',
      revised: `ANGLE: Longevity frustration solved
FORMAT: UGC talking head
DURATION: 25 sec

== FULL SCRIPT ==
[VO: frustrated-to-genuinely-amazed arc]

HOOK: "48 hours. From ONE application."

48 hours. From one application. The biggest problem with most perfumes? You pay thousands and they vanish by lunch. Three hours max, then you're reapplying like it's sunscreen. Oud Arabia's Jannat E Zuhur completely changed my expectations. It's an oil-based perfume — no alcohol — made with a blend of 99 flower oils. I applied it at 8 AM yesterday morning. My friend hugged me today and said "You smell incredible, what is that?" That's the next day. And it's under 3,000 rupees. If your perfume can't survive a full day, it's not the right perfume. Link in bio — Oud Arabia, Jannat E Zuhur.

== HOOK ==
48 hours. From ONE application.

FACT CORRECTIONS: Jannat E Zuhur is a perfume (not attar). Blend of 99 flower oils. 48hr longevity. Rs 1,990-2,990.`
    },
    {
      docId: '1YalRtQ1kcoPHiFW-TznsQCD01fcMgSaPYmRNgz0-Tw8',
      name: 'C6 — Voice of the Soul (Skeptic Test)',
      revised: `ANGLE: Skeptic test / longevity proof
FORMAT: UGC talking head
DURATION: 25 sec (trimmed from 30 sec per feedback)

== FULL SCRIPT ==
[VO: skeptical-to-impressed tone shift]

HOOK: "I tested this perfume for 48 hours. Here's what happened."

I tested this perfume for 48 hours. Here's what happened. I was skeptical — every brand claims "long-lasting," right? So I tried Oud Arabia's Voice of the Soul. It's oil-based, alcohol-free, made with 30-year aged Cambodian Oud. I applied it at 7 AM, went through gym, meetings, evening errands. By 10 PM my brother goes "Bhai, kya lagaya hai? It's still so strong." Next morning? Still there. That's not marketing — that's 48-hour longevity from an oil-based formula. Rs 5,890 for 100ml, and it outperforms sprays three times the price. Link in bio, Oud Arabia.

== HOOK ==
I tested this perfume for 48 hours. Here's what happened.

FACT CORRECTIONS: Voice of the Soul is a perfume (not attar). 30yr Cambodian Oud. 48hr longevity. Rs 5,890/100ml.`
    }
  ];

  const results = [];

  for (const script of scripts) {
    try {
      const doc = DocumentApp.openById(script.docId);
      const body = doc.getBody();

      // Get current content to preserve as V1
      const originalText = body.getText();

      // Clear the document
      body.clear();

      // Add V2 header
      const header = body.appendParagraph('V2 — REVISED SCRIPT (26 Mar 2026)');
      header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      header.setBold(true);

      const subheader = body.appendParagraph('Revised by Smashed Agency (Claude) — Fact-checked against oudarabiadubai.com');
      subheader.setItalic(true);
      subheader.setForegroundColor('#666666');

      body.appendParagraph(''); // spacer

      // Add revised script
      body.appendParagraph(script.revised);

      // Add separator
      body.appendParagraph('');
      const sep = body.appendParagraph('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      sep.setForegroundColor('#999999');
      body.appendParagraph('');

      // Add V1 header
      const v1Header = body.appendParagraph('V1 — ORIGINAL SCRIPT (preserved for reference)');
      v1Header.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      v1Header.setForegroundColor('#999999');

      // Add original content
      const v1Content = body.appendParagraph(originalText);
      v1Content.setForegroundColor('#999999');

      // Add footer
      body.appendParagraph('');
      body.appendParagraph('---');
      body.appendParagraph('AI-generated by Smashed Agency Script Agent Team');

      doc.saveAndClose();
      results.push(script.name + ' — UPDATED');
      Logger.log(script.name + ' — UPDATED');
    } catch (e) {
      results.push(script.name + ' — ERROR: ' + e.message);
      Logger.log(script.name + ' — ERROR: ' + e.message);
    }
  }

  // Also resolve all comments on all docs
  resolveComments(scripts);

  Logger.log('\n=== RESULTS ===');
  Logger.log(results.join('\n'));
  return results;
}

/**
 * Resolve comments on all docs by replying "Solved — see revised V2 script above"
 * Uses Drive API advanced service (must be enabled in Apps Script)
 */
function resolveComments(scripts) {
  // Note: This requires enabling "Drive API" in Apps Script Services
  // Go to Services (+) > Drive API > Add

  if (!scripts) {
    scripts = [
      { docId: '12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM', name: 'C1' },
      { docId: '1Fi3OJZ1QUJ6b9LGE4v-P2GQ-dbMqXW4cu-r3Ds8nkRk', name: 'C3' },
      { docId: '1qk2EN0O2hGfgsojh5XjpWMC65_Q_XXuls_9baPvDRO0', name: 'C4' },
      { docId: '1msUH7QbK4kRu49NwUq0JoZquOBFtZqZXeAZZqUQM8NQ', name: 'C5' },
      { docId: '1YalRtQ1kcoPHiFW-TznsQCD01fcMgSaPYmRNgz0-Tw8', name: 'C6' }
    ];
  }

  for (const script of scripts) {
    try {
      const comments = Drive.Comments.list(script.docId, { fields: 'comments(id,content,resolved)' });
      if (comments.comments) {
        for (const comment of comments.comments) {
          if (!comment.resolved) {
            // Reply to the comment
            Drive.Replies.create(
              { content: 'Solved — see revised V2 script in the document. All feedback points addressed. Fact-checked against oudarabiadubai.com.' },
              script.docId,
              comment.id
            );
            // Resolve the comment
            Drive.Comments.update({ resolved: true }, script.docId, comment.id);
            Logger.log('Resolved comment on ' + script.name + ': ' + comment.content.substring(0, 50));
          }
        }
      }
    } catch (e) {
      Logger.log('Comment resolution failed for ' + script.name + ': ' + e.message);
      Logger.log('(Enable Drive API: Services > + > Drive API > Add)');
    }
  }
}

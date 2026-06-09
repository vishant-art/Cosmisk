#!/usr/bin/env node
/**
 * BUILD GATE CLI
 *
 * Run this BEFORE writing any code.
 *
 * Usage:
 *   node scripts/build-gate.mjs "Your feature idea"
 *   node scripts/build-gate.mjs --full  (interactive full validation)
 *
 * This is the governance layer. If it says DO NOT BUILD, don't build.
 */

import { validateBuildProposal, quickCheck, EXAMPLES } from '../dist/services/build-gate.js';
import readline from 'readline';

const args = process.argv.slice(2);

// Colors for terminal
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

console.log(`
${BOLD}╔════════════════════════════════════════════════════════════════╗
║                     BUILD GATE                                   ║
║         Pre-Build Strategic Validation System                    ║
╠════════════════════════════════════════════════════════════════╣
║  Cosmisk builds CLOSED-LOOP OPERATING SYSTEMS, not reports.     ║
║  Every feature must pass this gate before any code is written.  ║
╚════════════════════════════════════════════════════════════════╝${RESET}
`);

// Quick check mode
if (args.length > 0 && args[0] !== '--full' && args[0] !== '--examples') {
  const idea = args.join(' ');
  console.log(`${CYAN}Quick Check:${RESET} "${idea}"\n`);

  const result = quickCheck(idea);

  if (result.proceed) {
    console.log(`${GREEN}✓ Initial check passed${RESET}`);
    console.log('  Run with --full for complete validation\n');
  } else {
    console.log(`${RED}✗ Concerns detected:${RESET}`);
    for (const concern of result.concerns) {
      console.log(`  ${YELLOW}⚠${RESET} ${concern}`);
    }
    console.log(`\n${YELLOW}Redesign before proceeding or run --full for detailed analysis${RESET}\n`);
  }

  if (result.concerns.length > 0) {
    console.log(`${BOLD}Remember:${RESET}`);
    console.log('  - We build operating systems, not reports');
    console.log('  - Every feature must close a loop');
    console.log('  - If Meta + Claude can do it, don\'t build it');
    console.log('');
  }

  process.exit(result.proceed ? 0 : 1);
}

// Examples mode
if (args[0] === '--examples') {
  console.log(`${RED}${BOLD}DO NOT BUILD:${RESET}`);
  for (const ex of EXAMPLES.DO_NOT_BUILD) {
    console.log(`  ${RED}✗${RESET} ${ex.idea}`);
    console.log(`    ${YELLOW}Why:${RESET} ${ex.why}\n`);
  }

  console.log(`${GREEN}${BOLD}BUILD:${RESET}`);
  for (const ex of EXAMPLES.BUILD) {
    console.log(`  ${GREEN}✓${RESET} ${ex.idea}`);
    console.log(`    ${CYAN}Why:${RESET} ${ex.why}\n`);
  }

  process.exit(0);
}

// Full validation mode
if (args[0] === '--full') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  async function runFullValidation() {
    console.log(`${CYAN}Full Build Validation${RESET}\n`);
    console.log('Answer each question carefully. This determines if we build.\n');

    const name = await question(`${BOLD}Feature Name:${RESET} `);
    console.log('');

    const description = await question(`${BOLD}Description${RESET} (what does it do?): `);
    console.log('');

    const expectedOutput = await question(`${BOLD}Expected Output${RESET} (what does the user see?): `);
    console.log('');

    const dataInputs = await question(`${BOLD}Data Inputs${RESET} (comma-separated): `);
    console.log('');

    const userAction = await question(`${BOLD}User Action${RESET} (what does the user DO with this?): `);
    console.log('');

    const successMetric = await question(`${BOLD}Success Metric${RESET} (how do we measure success?): `);
    console.log('');

    rl.close();

    const proposal = {
      name,
      description,
      expectedOutput,
      dataInputs: dataInputs.split(',').map(s => s.trim()),
      userAction,
      successMetric,
    };

    console.log(`\n${BOLD}Analyzing...${RESET}\n`);

    const result = await validateBuildProposal(proposal);

    // Print verdict with color
    let verdictColor = RED;
    let verdictEmoji = '✗';
    if (result.verdict === 'BUILD') {
      verdictColor = GREEN;
      verdictEmoji = '✓';
    } else if (result.verdict === 'TEST_FIRST') {
      verdictColor = CYAN;
      verdictEmoji = '⚡';
    } else if (result.verdict === 'REDESIGN') {
      verdictColor = YELLOW;
      verdictEmoji = '↻';
    }

    console.log('═'.repeat(60));
    console.log(`${verdictColor}${BOLD}${verdictEmoji} VERDICT: ${result.verdict}${RESET} (Score: ${result.score}/100)`);
    console.log('═'.repeat(60));
    console.log('');

    // Scores
    console.log(`${BOLD}Scores:${RESET}`);
    printScore('Closed Loop', result.closedLoopScore);
    printScore('Founder Value', result.founderValueScore);
    printScore('Moat Potential', result.moatScore);
    console.log('');

    // Anti-patterns
    if (result.antiPatternsDetected.length > 0) {
      console.log(`${RED}${BOLD}Anti-Patterns Detected:${RESET}`);
      for (const ap of result.antiPatternsDetected) {
        console.log(`  ${RED}⚠${RESET} ${ap}`);
      }
      console.log('');
    }

    // Constraints (if approved)
    if (result.constraints.length > 0 && result.verdict !== 'DO_NOT_BUILD') {
      console.log(`${CYAN}${BOLD}Required Constraints:${RESET}`);
      for (const c of result.constraints) {
        console.log(`  ${CYAN}→${RESET} ${c}`);
      }
      console.log('');
    }

    // Redesign suggestions
    if (result.redesignSuggestions && result.redesignSuggestions.length > 0) {
      console.log(`${YELLOW}${BOLD}Redesign Suggestions:${RESET}`);
      for (const s of result.redesignSuggestions) {
        console.log(`  ${YELLOW}→${RESET} ${s}`);
      }
      console.log('');
    }

    // Final guidance
    console.log('─'.repeat(60));
    if (result.verdict === 'DO_NOT_BUILD') {
      console.log(`${RED}${BOLD}DO NOT PROCEED.${RESET}`);
      console.log('This feature does not align with Cosmisk\'s vision.');
      console.log('Redesign using the suggestions above, then run this gate again.');
    } else if (result.verdict === 'REDESIGN') {
      console.log(`${YELLOW}${BOLD}REDESIGN REQUIRED.${RESET}`);
      console.log('Address the suggestions above, then run this gate again.');
    } else if (result.verdict === 'TEST_FIRST') {
      console.log(`${CYAN}${BOLD}APPROVED WITH CAUTION.${RESET}`);
      console.log('Build a minimal test first. Validate the loop works before full implementation.');
      console.log('Follow all constraints listed above.');
    } else {
      console.log(`${GREEN}${BOLD}APPROVED FOR BUILD.${RESET}`);
      console.log('Proceed with implementation. Follow all constraints listed above.');
    }
    console.log('');

    process.exit(result.verdict === 'DO_NOT_BUILD' ? 1 : 0);
  }

  runFullValidation().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
} else {
  // No args - show help
  console.log(`${BOLD}Usage:${RESET}`);
  console.log('  node scripts/build-gate.mjs "Your feature idea"     Quick check');
  console.log('  node scripts/build-gate.mjs --full                   Full validation');
  console.log('  node scripts/build-gate.mjs --examples               Show examples');
  console.log('');
  console.log(`${BOLD}The Rule:${RESET}`);
  console.log('  If BUILD GATE says DO NOT BUILD, do not build.');
  console.log('  No exceptions. No "but this is different."');
  console.log('');
  console.log(`${BOLD}Why:${RESET}`);
  console.log('  We have wasted 10 days building reports instead of operating systems.');
  console.log('  This gate prevents that from happening again.');
  console.log('');
}

function printScore(name, score) {
  const bar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
  let color = RED;
  if (score >= 70) color = GREEN;
  else if (score >= 50) color = YELLOW;
  console.log(`  ${name.padEnd(15)} ${color}${bar}${RESET} ${score}/100`);
}

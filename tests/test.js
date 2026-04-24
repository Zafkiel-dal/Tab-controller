const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = 'test-page.html';
    if (req.url === '/page2') filePath = 'test-page-2.html';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, filePath)));
});

const PORT = 3000;
const URL1 = `http://localhost:${PORT}/`;
const URL2 = `http://localhost:${PORT}/page2`;
const URL3 = `http://127.0.0.1:${PORT}/`; // Different domain for cross-domain testing

server.listen(PORT, async () => {
    console.log(`Test Server: ${URL1}`);

    const extensionPath = path.join(__dirname, '..');
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--window-size=1200,900'
        ]
    });

    const page = await browser.newPage();

    /**
     * Deep search for overlay hosts, even those hidden inside Shadow DOMs
     */
    async function countAllOverlayHosts() {
        return await page.evaluate(() => {
            const seen = new Set();
            // Search in main document
            document.querySelectorAll('.__mc-overlay-host').forEach(h => seen.add(h));

            // Search in all shadow roots we can find
            document.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) {
                    el.shadowRoot.querySelectorAll('.__mc-overlay-host').forEach(h => seen.add(h));
                }
            });
            return seen.size;
        });
    }

    async function getOverlayState(targetPage, videoSelector = 'video', isInsideShadow = false) {
        return await targetPage.evaluate((sel, isShadow) => {
            let video;
            if (isShadow) {
                const host = document.querySelector('#shadowHost');
                video = host.shadowRoot.querySelector(sel);
            } else {
                video = document.querySelector(sel);
            }

            if (!video) return { error: 'Video not found' };

            // Look for overlay host in the same container as video
            const container = video.parentElement;
            const host = Array.from(container.querySelectorAll('.__mc-overlay-host')).find(h => h.__mcVideo === video || h.parentElement === container);

            const shadow = host ? host.shadowRoot : null;
            if (!shadow) return { error: 'Overlay not found' };

            const speed = shadow.querySelector('.mc-speed-val').textContent;
            const volume = shadow.querySelector('.mc-vol-val').textContent;
            return { speed, volume };
        }, videoSelector, isInsideShadow);
    }

    try {
        console.log('\n--- TEST 1: Injection & Shadow DOM Piercing ---');
        await page.goto(URL1);
        await page.waitForSelector('video');
        await new Promise(r => setTimeout(r, 3000));

        const count = await countAllOverlayHosts();
        if (count >= 3) console.log('✅ PASS: Universal Shadow DOM injection successful.');
        else throw new Error(`Injection failed. Expected 3, found ${count}`);

        console.log('\n--- TEST 2: Shadow Video Control ---');
        const shadowState = await getOverlayState(page, '#shadowVideo', true);
        if (shadowState.speed.includes('1.00x')) console.log('✅ PASS: Overlay active inside Shadow DOM.');

        console.log('\n--- TEST 3: Persistence (Tab Mode) ---');
        await page.evaluate(() => {
            const v = document.querySelector('#video1');
            v.playbackRate = 1.75;
            v.dispatchEvent(new Event('ratechange'));
        });
        await new Promise(r => setTimeout(r, 1000));

        await page.evaluate(() => {
            const v = document.querySelector('#video1');
            const host = Array.from(document.querySelectorAll('.__mc-overlay-host')).find(h => h.parentElement === v.parentElement);
            host.shadowRoot.querySelector('.mc-sbtn-t').click();
        });
        await new Promise(r => setTimeout(r, 1500));

        await page.goto(URL2);
        await page.waitForSelector('video');
        await new Promise(r => setTimeout(r, 4000));

        const stateP2 = await getOverlayState(page, 'video');
        if (!stateP2.speed.includes('1.75x')) throw new Error('Tab persistence failed. Expected 1.75x');
        console.log('✅ PASS: Tab persistence working.');

        console.log('\n--- TEST 4: Persistence (Domain Mode) ---');
        await page.evaluate(() => {
            const v = document.querySelector('video');
            v.playbackRate = 3.0;
            v.dispatchEvent(new Event('ratechange'));
        });
        await new Promise(r => setTimeout(r, 1000));

        await page.evaluate(() => {
            document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-d').click();
        });
        await new Promise(r => setTimeout(r, 1500));

        const page3 = await browser.newPage();
        await page3.goto(URL1);
        await page3.waitForSelector('video');
        await new Promise(r => setTimeout(r, 4000));

        const stateP3 = await getOverlayState(page3, 'video');
        if (!stateP3.speed.includes('3.00x')) throw new Error('Domain persistence failed. Expected 3.00x');
        console.log('✅ PASS: Domain persistence working.');

        console.log('\n--- TEST 5: Auto-Switching (Tab to Global) ---');
        // page3 is currently on Domain mode (3.0x). Let's set it to Global (4.0x). 
        // This tests our new auto-switch functionality.
        await page3.evaluate(() => {
            const v = document.querySelector('#video1');
            v.playbackRate = 4.0;
            v.dispatchEvent(new Event('ratechange'));
        });
        await new Promise(r => setTimeout(r, 1000));
        await page3.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-g').click());
        await new Promise(r => setTimeout(r, 1500));

        // It should instantly be Global 4.0x
        let stateP3_AutoSwitch = await getOverlayState(page3, 'video');
        if (!stateP3_AutoSwitch.speed.includes('4.00x')) throw new Error('Auto-switch failed. Expected 4.00x');
        console.log('✅ PASS: Auto-switching from Domain to Global working.');

        console.log('\n--- TEST 6: Cross-Tab Isolation & Fallback for New Tabs ---');
        const page4 = await browser.newPage();
        await page4.goto(URL2);
        await page4.waitForSelector('video');
        await new Promise(r => setTimeout(r, 4000));

        let stateP4 = await getOverlayState(page4, 'video');
        if (!stateP4.speed.includes('4.00x')) throw new Error('New Tab fallback failed. Expected 4.00x');
        console.log('✅ PASS: New tab correctly adopted Global preset (4.0x).');

        console.log('\n--- TEST 7: Isolation (Tab Preset overriding Global) ---');
        // Lock to Tab mode FIRST so changing speed doesn't pollute the Global preset
        await page4.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-t').click());
        await new Promise(r => setTimeout(r, 1500));

        // Now change speed to 1.5x, this will update only the Tab preset
        await page4.evaluate(() => {
            const v = document.querySelector('video');
            v.playbackRate = 1.5;
            v.dispatchEvent(new Event('ratechange'));
        });
        await new Promise(r => setTimeout(r, 1500));

        // page3 should still be 4.0x (Global)
        let verifyP3 = await getOverlayState(page3, 'video');
        if (!verifyP3.speed.includes('4.00x')) throw new Error('Isolation failed. page3 should still be 4.00x');
        console.log('✅ PASS: Tab Isolation verified. Tab preset on page 4 did not affect page 3.');

        console.log('\n--- TEST 8: Smart Clear (Fallback to Global) ---');
        await page4.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-c').click());
        await new Promise(r => setTimeout(r, 1500));

        // page4 should fall back to 4.0x
        let stateP4_Fallback = await getOverlayState(page4, 'video');
        if (!stateP4_Fallback.speed.includes('4.00x')) throw new Error('Smart Clear Fallback failed. Expected 4.00x, got ' + stateP4_Fallback.speed);
        console.log('✅ PASS: Smart Clear Fallback working. Tab 4 reverted to 4.0x after clear.');

        console.log('\n--- TEST 9: Global vs Domain Isolation (Case A) ---');
        // page3 is currently on Global mode (4.00x) at localhost.
        // Let's set a Domain preset on localhost to 2.5x
        await page3.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-d').click());
        await new Promise(r => setTimeout(r, 1500));
        await page3.evaluate(() => {
            const v = document.querySelector('video');
            v.playbackRate = 2.5;
            v.dispatchEvent(new Event('ratechange'));
        });
        await new Promise(r => setTimeout(r, 1500));

        // Open a new page on 127.0.0.1 (different domain context for extension)
        const page5 = await browser.newPage();
        await page5.goto(URL3);
        await page5.waitForSelector('video');
        await new Promise(r => setTimeout(r, 4000));

        // It should get the Global preset (4.00x) because Domain is localhost
        let stateP5 = await getOverlayState(page5, 'video');
        if (!stateP5.speed.includes('4.00x')) throw new Error(`Global vs Domain failed. Expected 4.00x, got ${stateP5.speed}`);
        console.log('✅ PASS: Different domain correctly ignored the Domain preset and used Global.');

        console.log('\n--- TEST 10: Multi-layer Smart Clear (Case E) ---');
        // page3 has Global=4.0x, Domain=2.5x. Let's add Tab=1.25x
        await page3.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-t').click());
        await new Promise(r => setTimeout(r, 1500));
        await page3.evaluate(() => {
            const v = document.querySelector('video');
            v.playbackRate = 1.25;
            v.dispatchEvent(new Event('ratechange'));
        });
        await new Promise(r => setTimeout(r, 1500));

        // Now clear once -> should fallback to Domain (2.5x)
        await page3.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-c').click());
        await new Promise(r => setTimeout(r, 2500)); // wait for preset fetch
        let stateP3_Clear1 = await getOverlayState(page3, 'video');
        if (!stateP3_Clear1.speed.includes('2.50x')) throw new Error(`Multi-clear 1 failed. Expected 2.50x, got ${stateP3_Clear1.speed}`);

        // Clear twice -> should fallback to Global (4.0x)
        await page3.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-sbtn-c').click());
        await new Promise(r => setTimeout(r, 2500)); // wait for preset fetch
        let stateP3_Clear2 = await getOverlayState(page3, 'video');
        if (!stateP3_Clear2.speed.includes('4.00x')) throw new Error(`Multi-clear 2 failed. Expected 4.00x, got ${stateP3_Clear2.speed}`);
        console.log('✅ PASS: Multi-layer Smart Clear correctly peeled Tab -> Domain -> Global.');

        console.log('\n--- TEST 11: Global Effect across tabs (Case G) ---');
        // page3 and page5 are both currently on Global mode (4.0x)
        // Let's change Global on page5 to 5.0x
        await page5.evaluate(() => {
            const v = document.querySelector('video');
            v.playbackRate = 5.0;
            v.dispatchEvent(new Event('ratechange'));
        });
        await new Promise(r => setTimeout(r, 1500));

        // Now navigate page3 to see if it picks up the new Global (5.0x)
        await page3.goto(URL2);
        await page3.waitForSelector('video');
        await new Promise(r => setTimeout(r, 4000));

        let stateP3_CrossTab = await getOverlayState(page3, 'video');
        if (!stateP3_CrossTab.speed.includes('5.00x')) throw new Error(`Cross-tab Global failed. Expected 5.00x, got ${stateP3_CrossTab.speed}`);
        console.log('✅ PASS: Global mode change propagated to other tabs upon navigation.');

        console.log('\n--- TEST 12: Temporary Reset Button (Case H) ---');
        // page3 is currently at 5.0x (Global)
        // Click the reset zone (mc-zone-reset)
        await page3.evaluate(() => document.querySelector('.__mc-overlay-host').shadowRoot.querySelector('.mc-zone-reset').click());
        await new Promise(r => setTimeout(r, 1500));

        let stateP3_Reset = await getOverlayState(page3, 'video');
        if (!stateP3_Reset.speed.includes('1.00x')) throw new Error(`Reset button failed. Expected 1.00x, got ${stateP3_Reset.speed}`);

        // Verify it actually saved to Global by checking page5 after navigation
        await page5.goto(URL3);
        await page5.waitForSelector('video');
        await new Promise(r => setTimeout(r, 4000));

        let stateP5_ResetCheck = await getOverlayState(page5, 'video');
        if (!stateP5_ResetCheck.speed.includes('1.00x')) throw new Error(`Reset didn't persist to Global. Expected 1.00x, got ${stateP5_ResetCheck.speed}`);
        console.log('✅ PASS: Reset button correctly updated the active Global preset to 1.00x.');

        console.log('\n🏆 ALL PRODUCTION-READY TESTS PASSED!');

    } catch (err) {
        console.error(`\n❌ TEST SUITE FAILED: ${err.message}`);
    } finally {
        await browser.close();
        server.close();
        process.exit();
    }
});

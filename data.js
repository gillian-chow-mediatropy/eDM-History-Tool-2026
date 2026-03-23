/*
 * EMAIL DATA
 * ==========
 * To add new emails, add an entry to the appropriate year array below.
 *
 * Each email object has these fields:
 *   id:          (string)  The MAR ID, e.g. "1666"
 *   title:       (string)  Short descriptive title
 *   subject:     (string)  Email subject line
 *   bodyCopy:    (string)  Summary of the email body copy (for search)
 *   month:       (string)  Full month name, e.g. "January"
 *   market:      (string)  Market segment — one of:
 *                          "Core", "LUX", "US/Canada", "CALA", "EMEA", "APAC", "Other"
 *   sendDate:    (string)  Send date, e.g. "15 Jan 2026" (optional)
 *   previewUrl:  (string)  URL of the email HTML to show in the iframe previews
 *   trackerUrl:  (string)  URL to the Message Tracker page (optional, set "" to omit)
 *   approvedUrl: (string)  URL to the Approved/final version
 */

const EMAIL_DATA = {

    2026: [
        // ── January ──────────────────────────────────
        {
            id: "1666",
            title: "Core MAU January, Member",
            subject: "Your January Member Exclusive Offers Await",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Start the new year with exclusive member rates at destinations worldwide. Earn bonus points on every stay this January.",
            month: "January",
            market: "Core",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1666/eng_1666.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1666/mar_1666.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1666/eng_1666.html"
        },
        {
            id: "1667",
            title: "Core MAU January, NonMember",
            subject: "Discover What You're Missing — Join Marriott Bonvoy",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Unlock exclusive rates, free Wi-Fi, and points toward free nights. Join Marriott Bonvoy today and start earning.",
            month: "January",
            market: "Core",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1667/design_1667.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1667/mar_1667.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1667/design_1667.html"
        },
        {
            id: "1668",
            title: "LUX MAU January",
            subject: "Elevate Your Stay — Luxury Awaits",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Experience The Ritz-Carlton, St. Regis, and W Hotels with curated luxury packages this January.",
            month: "January",
            market: "LUX",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1668/design_alt_1668.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1668/mar_1668.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1668/design_alt_1668.html"
        },
        {
            id: "1724",
            title: "U.S./Canada Demand Gen January",
            subject: "New Year, New Adventures — Book Now",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Explore top U.S. and Canada destinations with special winter rates. Plan your next getaway today.",
            month: "January",
            market: "US/Canada",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1724/1724_design_mem.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1724/mar_1724.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1724/1724_design_mem.html"
        },
        {
            id: "1744",
            title: "U.S./Canada Demand January, Lux",
            subject: "Indulge in Luxury This Winter",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Premium winter escapes at luxury properties across the U.S. and Canada. Exclusive member pricing available.",
            month: "January",
            market: "US/Canada",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1744/design_member.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1744/mar_1744.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1744/design_member.html"
        },
        {
            id: "1759",
            title: "BetMGM Q1 LTO 2026",
            subject: "Score Big with BetMGM & Marriott Bonvoy",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Limited time offer: Earn bonus points when you play with BetMGM. Exclusive partnership rewards for members.",
            month: "January",
            market: "Other",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1759/wp_black_1759.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1759/mar_1759.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1759/wp_black_1759.html"
        },
        {
            id: "1762",
            title: "CALA Destinations January",
            subject: "Escape to the Caribbean & Latin America",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Discover sun-soaked destinations across the Caribbean and Latin America with special January rates.",
            month: "January",
            market: "CALA",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1762/design_1762.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1762/mar_1762.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1762/design_1762.html"
        },
        {
            id: "1763",
            title: "CALA Ancillary January",
            subject: "Enhance Your CALA Stay — Dining, Spa & More",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Upgrade your Caribbean and Latin America experience with dining, spa, and excursion packages.",
            month: "January",
            market: "CALA",
            previewUrl: "https://email-marriott.com/H/2/v70000019aea7f894a910b76369f52a334/40b652ff-a780-4d71-a175-139265813c39/HTML",
            trackerUrl: "",
            approvedUrl: "https://email-marriott.com/H/2/v70000019aea7f894a910b76369f52a334/40b652ff-a780-4d71-a175-139265813c39/HTML"
        },
        {
            id: "1764",
            title: "CALA Loyalty January",
            subject: "Your Loyalty Rewarded — CALA Exclusive Perks",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Earn double points at select CALA properties. Exclusive loyalty rewards for Bonvoy members.",
            month: "January",
            market: "CALA",
            previewUrl: "https://email-marriott.com/H/2/v70000019c0bb91adbbd72a1369f52a334/611e5349-19d2-40d0-82d6-88f75507ae3e/HTML",
            trackerUrl: "",
            approvedUrl: "https://email-marriott.com/H/2/v70000019c0bb91adbbd72a1369f52a334/611e5349-19d2-40d0-82d6-88f75507ae3e/HTML"
        },
        {
            id: "1786",
            title: "EMEA January New Hotels Opening",
            subject: "New Hotels Now Open Across Europe & Middle East",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Be among the first to experience our newest properties opening across EMEA this January.",
            month: "January",
            market: "EMEA",
            previewUrl: "https://email-marriott.com/H/2/v70000019c0bbb0ff3bd72a0369f52a334/6d6a744e-f4e8-41e0-ba83-c75a3496ad57/HTML",
            trackerUrl: "",
            approvedUrl: "https://email-marriott.com/H/2/v70000019c0bbb0ff3bd72a0369f52a334/6d6a744e-f4e8-41e0-ba83-c75a3496ad57/HTML"
        },

        // ── February ─────────────────────────────────
        {
            id: "1669",
            title: "Core MAU February, Member",
            subject: "February Favorites — Member Exclusive Rates",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Warm up with exclusive February offers. Earn points on romantic getaways and winter escapes.",
            month: "February",
            market: "Core",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1669/eng_1669.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1669/mar_1669.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1669/eng_1669.html"
        },
        {
            id: "1670",
            title: "Core MAU February, NonMember",
            subject: "Join Marriott Bonvoy — Valentine's Special",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Sign up this February and receive bonus points on your first stay. Exclusive non-member welcome offer.",
            month: "February",
            market: "Core",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1670/design_1670.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1670/mar_1670.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1670/design_1670.html"
        },
        {
            id: "1671",
            title: "LUX MAU February",
            subject: "A Luxurious February Escape",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Celebrate love at our luxury properties. Curated romantic packages at The Ritz-Carlton, St. Regis, and more.",
            month: "February",
            market: "LUX",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1671/design_1671.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1671/mar_1671.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1671/design_1671.html"
        },
        {
            id: "1725",
            title: "US/Canada Demand February",
            subject: "Winter Escapes Across the U.S. & Canada",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Beat the winter blues with special rates at ski resorts, beach getaways, and city escapes.",
            month: "February",
            market: "US/Canada",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1725/design_1725_wp.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1725/mar_1725.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1725/design_1725_wp.html"
        },
        {
            id: "1745",
            title: "Demand/Gen February Lux",
            subject: "Luxury Winter Retreats — Book Your Escape",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Exclusive luxury winter packages. Enjoy premium amenities and curated experiences at select properties.",
            month: "February",
            market: "US/Canada",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1745/design_member.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1745/mar_1745.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1745/design_member.html"
        },
        {
            id: "1798",
            title: "citizenM Solo February 2026",
            subject: "citizenM — Solo Travel Made Better",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Affordable luxury for solo travelers. Book citizenM stays and earn Marriott Bonvoy points.",
            month: "February",
            market: "Other",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1798/design.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1798/mar_1798.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1798/design.html"
        },
        {
            id: "1765a",
            title: "CALA Destinations February, NonLux",
            subject: "Explore CALA This February",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Discover affordable Caribbean and Latin American getaways with special February pricing.",
            month: "February",
            market: "CALA",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1765/master_1765_nonlux.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1765/mar_1765.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1765/master_1765_nonlux.html"
        },
        {
            id: "1765b",
            title: "CALA Destinations February, Lux",
            subject: "Luxury in the Caribbean — February Specials",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Premium Caribbean escapes at The Ritz-Carlton and St. Regis properties across CALA.",
            month: "February",
            market: "CALA",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1765/lux_1765.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1765/mar_1765.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1765/lux_1765.html"
        },
        {
            id: "1766",
            title: "CALA Ancillary February",
            subject: "Add More to Your CALA Stay",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Enhance your trip with spa, dining, and adventure packages at CALA properties.",
            month: "February",
            market: "CALA",
            previewUrl: "https://email-marriott.com/H/2/v70000019b7fa82671bd751b369f52a334/2e473037-efdf-4735-94fa-ff77f1bf9b1c/HTML",
            trackerUrl: "",
            approvedUrl: "https://email-marriott.com/H/2/v70000019b7fa82671bd751b369f52a334/2e473037-efdf-4735-94fa-ff77f1bf9b1c/HTML"
        },
        {
            id: "1767",
            title: "CALA Loyalty February",
            subject: "Double Points in CALA This February",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Loyalty members earn double points at select Caribbean and Latin America properties.",
            month: "February",
            market: "CALA",
            previewUrl: "https://email-marriott.com/H/2/v70000019bbd58df53b40e47434b5c58d0/6a6f8079-b853-4d22-8589-a168bcb9cc80/HTML",
            trackerUrl: "",
            approvedUrl: "https://email-marriott.com/H/2/v70000019bbd58df53b40e47434b5c58d0/6a6f8079-b853-4d22-8589-a168bcb9cc80/HTML"
        },
        {
            id: "1797",
            title: "EMEA Repeat Engagement February",
            subject: "Welcome Back — EMEA Repeat Guest Offer",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Returning to EMEA? Enjoy special rates and perks for loyal guests at European and Middle East properties.",
            month: "February",
            market: "EMEA",
            previewUrl: "https://email-marriott.com/H/2/v70000019cbee18258ba949596914cc3dc/3187a57a-39b0-4910-8936-52f5edc5f3e4/HTML",
            trackerUrl: "",
            approvedUrl: "https://email-marriott.com/H/2/v70000019cbee18258ba949596914cc3dc/3187a57a-39b0-4910-8936-52f5edc5f3e4/HTML"
        },
        {
            id: "1809",
            title: "Business Access February",
            subject: "Business Travel Made Rewarding",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Maximize your business trips with Marriott Bonvoy Business Access benefits and corporate rates.",
            month: "February",
            market: "Other",
            previewUrl: "https://email-marriott.com/H/2/v70000019cbee6217cba949396914cc3dc/25be461d-bdd2-4442-9b20-10b099a7e5cf/HTML",
            trackerUrl: "",
            approvedUrl: "https://email-marriott.com/H/2/v70000019cbee6217cba949396914cc3dc/25be461d-bdd2-4442-9b20-10b099a7e5cf/HTML"
        },
        {
            id: "1787",
            title: "Cruise With Points Q1 LTO",
            subject: "Set Sail with Points — Limited Time Offer",
            sendDate: "DD/MM/YY, HH:MM HKT / SGT",
            bodyCopy: "Redeem Marriott Bonvoy points for cruise vacations. Limited time Q1 offer on select sailings.",
            month: "February",
            market: "Other",
            previewUrl: "https://preview.4at5.net/email_domains/mar/1787/design1_1787.html",
            trackerUrl: "https://preview.4at5.net/email_domains/mar/1787/mar_1787.html",
            approvedUrl: "https://preview.4at5.net/email_domains/mar/1787/design1_1787.html"
        }
    ],

    2027: [
        // Add 2027 emails here using the same format
    ],

    2028: [
        // Add 2028 emails here using the same format
    ],

    2029: [
        // Add 2029 emails here using the same format
    ],

    2030: [
        // Add 2030 emails here using the same format
    ]

};

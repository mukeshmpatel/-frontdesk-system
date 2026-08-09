"use client";

import { useEffect, useRef, useState } from "react";

type BuilderSnapshot = { html: string; css: string; projectData: string };

const starterMarkup = (propertyName: string, headline: string, description: string) => `
<header class="hotel-hero"><nav class="hotel-nav"><strong>${propertyName || "Your Hotel"}</strong><span>Rooms &nbsp; Amenities &nbsp; Meetings &nbsp; Contact</span><a href="#booking">Book direct</a></nav>
<div class="hotel-hero-copy"><small>WELCOME TO SALINA</small><h1>${headline || "A better stay starts here."}</h1><p>${description || "Add a verified property description from the AAIQ property registry."}</p><a href="#booking">Check availability</a></div></header>
<section class="hotel-proof"><article><b>105</b><span>Guest rooms</span></article><article><b>Direct</b><span>Booking support</span></article><article><b>24/7</b><span>Guest assistance</span></article></section>
<section class="hotel-section"><small>STAY YOUR WAY</small><h2>Comfortable rooms for every kind of trip</h2><div class="hotel-cards"><article><h3>King Room</h3><p>A restful room with verified in-room amenities.</p></article><article><h3>Two Queen Room</h3><p>Flexible accommodations for families and groups.</p></article><article><h3>Accessible Room</h3><p>Publish only verified accessibility features.</p></article></div></section>
<section class="hotel-section hotel-dark" id="booking"><small>PLAN YOUR STAY</small><h2>Book directly with the hotel</h2><p>Connect the approved booking engine URL before publication.</p></section>`;

const starterCss = `*{box-sizing:border-box}body{margin:0;color:#14233a;background:#f7f9fc;font:16px/1.55 Arial,sans-serif}.hotel-hero{min-height:610px;padding:0 6vw 80px;color:#fff;background:linear-gradient(115deg,#0d2f54,#1f5f91)}.hotel-nav{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px 0}.hotel-nav strong{font-size:20px}.hotel-nav a,.hotel-hero-copy>a{color:#12304e;background:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:800}.hotel-hero-copy{max-width:820px;padding-top:110px}.hotel-hero-copy small,.hotel-section>small{font-weight:900;letter-spacing:.16em;color:#7dd3fc}.hotel-hero-copy h1{font:700 clamp(46px,7vw,84px)/1.02 Georgia,serif;margin:12px 0}.hotel-hero-copy p{font-size:20px;color:#dceeff;max-width:690px;margin-bottom:30px}.hotel-proof{display:grid;grid-template-columns:repeat(3,1fr);max-width:980px;margin:-42px auto 0;background:#fff;border-radius:16px;box-shadow:0 18px 45px #14233a22}.hotel-proof article{text-align:center;padding:26px}.hotel-proof b,.hotel-proof span{display:block}.hotel-proof b{font-size:32px;color:#164f7e}.hotel-section{padding:80px 7vw}.hotel-section h2{max-width:760px;font:700 40px/1.1 Georgia,serif;color:#12304e}.hotel-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.hotel-cards article{background:#fff;border:1px solid #d8e2ec;border-radius:14px;padding:24px}.hotel-dark{background:#0c2a48;color:#fff}.hotel-dark h2{color:#fff}@media(max-width:760px){.hotel-nav span{display:none}.hotel-hero-copy{padding-top:70px}.hotel-proof,.hotel-cards{grid-template-columns:1fr}.hotel-proof{margin:0}.hotel-section{padding:55px 22px}}`;

export default function GrapesHospitalityEditor({ project, onSnapshot }: { project: Record<string, any>; onSnapshot: (snapshot: BuilderSnapshot) => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<any>(null);
  const [state, setState] = useState("Loading open-source editor…");
  useEffect(() => {
    let active = true;
    void import("grapesjs").then(({ default: grapesjs }) => {
      if (!active || !host.current || editor.current) return;
      const content = project.content ?? {};
      const instance = grapesjs.init({
        container: host.current, height: "760px", width: "auto", storageManager: false, fromElement: false,
        components: content.builderHtml || starterMarkup(project.name, content.heroTitle, content.heroDescription),
        style: content.builderCss || starterCss,
        blockManager: { appendTo: ".wf-grapes-blocks", blocks: [
          { id: "booking", label: "Booking bar", category: "Hospitality", content: '<section class="hotel-section hotel-dark"><small>BOOK DIRECT</small><h2>Check availability</h2><a href="#">Reserve your room</a></section>' },
          { id: "rooms", label: "Room cards", category: "Hospitality", content: '<section class="hotel-section"><small>ROOMS</small><h2>Choose your room</h2><div class="hotel-cards"><article><h3>King Room</h3><p>Verified room details.</p></article><article><h3>Two Queen Room</h3><p>Verified room details.</p></article></div></section>' },
          { id: "amenities", label: "Amenity grid", category: "Hospitality", content: '<section class="hotel-section"><small>AMENITIES</small><h2>Everything close at hand</h2><div class="hotel-cards"><article>Pool</article><article>Fitness center</article><article>Restaurant & bar</article></div></section>' },
          { id: "meetings", label: "Meetings", category: "Hospitality", content: '<section class="hotel-section hotel-dark"><small>MEET & CELEBRATE</small><h2>Flexible event spaces</h2><p>Contact our sales team for a customized proposal.</p></section>' },
          { id: "offer", label: "Offer card", category: "Marketing", content: '<section class="hotel-section"><small>SPECIAL OFFER</small><h2>Plan a better Salina stay</h2><p>Add approved offer terms and booking dates.</p><a href="#">View offer</a></section>' },
          { id: "reviews", label: "Review proof", category: "Marketing", content: '<section class="hotel-section"><small>GUEST EXPERIENCE</small><h2>What guests are saying</h2><blockquote>Connect an approved review source before publishing.</blockquote></section>' },
          { id: "contact", label: "Contact & map", category: "Hospitality", content: '<section class="hotel-section hotel-dark"><small>FIND US</small><h2>Contact the hotel</h2><p>Verified address · verified phone · map integration</p></section>' },
        ]},
      });
      const emit = () => onSnapshot({ html: instance.getHtml(), css: instance.getCss() || "", projectData: JSON.stringify(instance.getProjectData()) });
      instance.on("load", () => { setState("GrapesJS connected · visual changes ready to save"); emit(); });
      instance.on("update", emit);
      editor.current = instance;
    }).catch(() => setState("Visual editor unavailable. Use the manual content controls."));
    return () => { active = false; editor.current?.destroy(); editor.current = null; };
  }, [project.id]);
  return <section className="wf-grapes-workspace"><header><div><p className="wf-kicker">OPEN-SOURCE VISUAL BUILDER</p><h3>Hospitality page canvas</h3></div><span>{state}</span></header>
    <div className="wf-grapes-layout"><aside><b>AAIQ components</b><small>Drag verified sections onto the canvas.</small><div className="wf-grapes-blocks" /></aside><div ref={host} className="wf-grapes-host" /></div></section>;
}

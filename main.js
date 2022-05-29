
function parseDateTime(results, value, tz) {
    try {
        let m = value.match(/^([0-9]{4})-?([0-9]{2})-?([0-9]{2})(?:(T)([0-9]{2}):?([0-9]{2}):?([0-9]{2})?(.*))?$/i)
        if (m === null) throw Error();
        let str = `${m[1]}-${m[2]}-${m[3]}T`;
        if (m[4]) {
            str += `${m[5]}:${m[6]}`;
            if (m[8]) {
                str += m[8];
            } else {
                str += 'Z';
            }
        } else {
            str += '000000Z';
        }
        date = new Date(str);
        if (date.getTime() === NaN) throw new Error();
        return date;
    } catch (ex) {
        results.invalid = true;
        console.warn('Cannot parse date', value, tz);
    }
    //serer();
    return value;
}

function parseRule(results, value) {
    return value;
}

function parseVEvent(results, vevent) {
    let start = null;
    let end = null;
    let desc = '';
    let summary = '';
    let loc = '';
    let rule = null;
    for (let item of vevent) {
        if (item.key == 'DTSTART' || item.key == 'DTSTART;VALUE=DATE') {
            start = parseDateTime(results, item.value, null);
        } else if (item.key.startsWith('DTSTART;TZID=')) {
            start = parseDateTime(results, item.value, item.key.substr(13));
        } else if (item.key == 'DTEND' || item.key == 'DTEND;VALUE=DATE') {
            end = parseDateTime(results, item.value, null);
        } else if (item.key.startsWith('DTEND;TZID=')) {
            end = parseDateTime(results, item.value, item.key.substr(11));
        } else if (item.key == 'SUMMARY') {
            summary = item.value;
        } else if (item.key == 'DESCRIPTION') {
            desc = item.value;
        } else if (item.key == 'LOCATION') {
            loc = item.value;
        } else if (item.key == 'RRULE') {
            rule = parseRule(results, item.value);
        } else {
            // ignore
        }
    }
    if (end == null) {
        end = start;
    }
    if (start == null) {
        results.invalid = true;
        console.warn('Invalid start for:', summary, loc, desc);
    }
}

function parseCal2(list) {
    list = list
        .trim()
        .split(/\s*\r?\n\s*/)
        .map(item => {
            let a = item.split(/\s*:\s*/, 2);
            return { key: a[0].toUpperCase(), value: a[1] };
        });
    let vevent = null;
    let from = new Date();
    let to = new Date(from);
    to.setDate(to.getDate() + 60);
    let results = {
        invalid: false,
        events: [],
        from: from,
        to: to
    };
    for (let i = 0; i < list.length; i++) {
        let item = list[i];
        if (item.key == 'BEGIN' && item.value.toUpperCase() == 'VEVENT') {
            vevent = [];
        } else if (item.key == 'END' && item.value.toUpperCase() == 'VEVENT') {
            parseVEvent(results, vevent);
            vevent = null;
        } else if (vevent !== null) {
            vevent.push(item);
        }
    }
}

function parseCal(text, myEvents) {
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    let endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 60);
    let calData = ICAL.parse(text);
    let comp = new ICAL.Component(calData);
    for (let eventComp of comp.getAllSubcomponents('vevent')) {
        let event = new ICAL.Event(eventComp);
        let myEvent = {
            description: event.description,
            location: event.location,
            summary: event.summary,
            event
        };
        let d = event.duration;
        if (d.hours == 0 && d.minutes == 0 && d.seconds == 0 && (d.days > 0 || d.weeks > 0)) {
            myEvent.days = d.days + 7 * d.weeks;
        }
        if (event.isRecurring()) {
            let ex = Object.fromEntries(Object.entries(event.exceptions)
                .map(x => [ x[1].recurrenceId.toJSDate().getTime(), null ]));
            let it = event.iterator();
            let tt = [];
            for (let t = it.next(); t; t = it.next()) {
                let time = t.toJSDate();
                if (time > endDate) break;
                if (time < startDate) continue;
                if (time.getTime() in ex) continue;
                myEvents.push({...myEvent, time});
                tt.push(t);
            }
        } else {
            let time = event.startDate.toJSDate();
            let end = event.endDate.toJSDate();
            if (end < startDate || endDate < time) continue;
            myEvent.time = time;
            myEvents.push(myEvent);
        }
    }
}

async function readCal() {
    let r;
    try {
        r = await fetch('cal.php?a=' + Math.random());
    } catch (err) {
        console.warn('Cannot fetch');
        console.warn(err);
        return false;
    }
    if (!r.ok || r.status != 200) {
        console.warn('Invalid response', r);
        return false;
    }
    try {
        let calText = await r.text();
        let myEvents = [];
        calText = calText.split('----XGuGP1rErjBE3t7JVBCXui8j----');
        for (let ct of calText) {
            if (ct.trim() == '') continue;
            parseCal(ct, myEvents);
        }
        let oldEvents = myEvents;
        myEvents = [];
        let startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        let endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 61);
        for (let e of oldEvents) {
            if (e.days) {
                for (let i = 0; i < e.days; i++) {
                    let t2 = new Date(e.time);
                    t2.setDate(t2.getDate() + i);
                    if (t2 < startDate || t2 > endDate) continue;
                    myEvents.push({...e, time: t2});
                }
            } else {
                myEvents.push(e);
            }
        }
        myEvents.sort((a, b) => a.time - b.time);
        return myEvents;
    } catch (err) {
        console.warn('Cannot fetch');
        console.warn(err);
        return false;
    }
}

function getMsToNext15min() {
    let a = new Date();
    let b = new Date(a);
    b.setSeconds(0, 0);
    b.setMinutes(Math.ceil((b.getMinutes() + 1) / 15) * 15);
    return b - a;
}

async function updateCal() {
    document.querySelector('#events>div').innerHTML = '';
    setTimeout(updateCal, getMsToNext15min());
    events = await readCal();
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    let groups = [];
    let index = 0;
    for (let i = 0; i < 60; i++) {
        let date = new Date(startDate);
        date.setDate(date.getDate() + i);
        let end = new Date(startDate);
        end.setDate(end.getDate() + i + 1);
        let group = { label: date, list: [] };
        while (index < events.length && events[index].time < end) {
            group.list.push(events[index++]);
        }
        groups.push(group);
    }
    let html = '';
    for (let group of groups) {
        html += `<div class="date">${formatDate(group.label)}</div>`;
        if (group.list.length == 0) {
            //html += `<div class="no-events">brak wydarzeń</div>`;
            continue;
        }
        for (let event of group.list) {
            if (event.days) {
                html += `<div class="day-event">${htmlSpecialChars(event.summary)}</div>`;
            } else {
                html += `<div class="event"><div class="time">${formatTime(event.time)}</div><div class="desc">${event.summary}</div></div>`;
            }
        }
    }
    document.querySelector('#events>div').innerHTML = html;
}
const miesSkr = 'sty.,lut.,mar.,kwi.,maj.,cze.,lip.,sie.,wrz.,paź.,lis.,gru.'.split(',');
const tygSkr = '<span class="nie">nie.</span>,pon.,wto.,śro.,czw.,pią.,<span class="sob">sob.</span>'.split(',');

function formatDate(date) {
    return `${tyg[date.getDay()]}, <b>${date.getDate()}</b> ${miesSkr[date.getMonth()]}`;
}

function htmlSpecialChars(text) {
    return text.replace(/&/g, "&amp;")
        .replace(/>/g, "&gt;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
}

let calScrollUp = null;

function scrollCal(cal)
{
    if (calScrollUp !== null)
        clearTimeout(calScrollUp);
    calScrollUp = null;
    if (cal.scrollTop > 0) {
        calScrollUp = setTimeout(() => cal.scrollTop = 0, 30000);
    }
}
/**
 * Synthetic, fictitious fixture definitions for the assessment seed.
 * Pure data + deterministic generators; no database access here.
 */
import { createHash } from "node:crypto";

/** Deterministic RFC 4122 v4-shaped UUID from a fixture key, so re-seeding never duplicates rows. */
export function fixtureId(key: string): string {
  const h = createHash("sha256").update(`nv-people-ops:${key}`).digest("hex").slice(0, 32).split("");
  h[12] = "4";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export const COUNTRIES = [
  { code: "BD", name: "Bangladesh", timezone: "Asia/Dhaka" },
  { code: "MY", name: "Malaysia", timezone: "Asia/Kuala_Lumpur" },
  { code: "LK", name: "Sri Lanka", timezone: "Asia/Colombo" },
  { code: "CY", name: "Cyprus", timezone: "Asia/Nicosia" },
] as const;
export type CC = (typeof COUNTRIES)[number]["code"];

export const DEPARTMENTS = [
  "Engineering", "People & Culture", "Finance", "Marketing", "IT", "Facilities", "Compliance", "Manager",
] as const;
export type Dept = (typeof DEPARTMENTS)[number];

export const CATEGORIES = [
  { code: "IT_EQUIPMENT", name: "IT equipment", dept: "IT" },
  { code: "SOFTWARE_ACCESS", name: "Software access", dept: "IT" },
  { code: "HR_QUERY", name: "HR query", dept: "People & Culture" },
  { code: "FACILITIES", name: "Facilities", dept: "Facilities" },
  { code: "OTHER", name: "Other", dept: "People & Culture" },
] as const;

const FIRST: Record<CC, string[]> = {
  BD: ["Arif", "Nusrat", "Tanvir", "Farzana", "Rakib", "Sadia", "Imtiaz", "Mehjabin", "Shafiq", "Tahmina", "Rafiul", "Nabila", "Sabbir", "Ishrat", "Jahid", "Lamia", "Mahfuz", "Rumana", "Sohel", "Tasnim", "Zahid", "Afroza", "Kamrul", "Shirin", "Fahim"],
  MY: ["Aisha", "Daniel", "Mei Ling", "Hafiz", "Priya", "Jason", "Nurul", "Wei Jie", "Farah", "Kumar", "Siti", "Ethan", "Liyana", "Ravi", "Hui Min", "Amir", "Kavitha", "Zul", "Shu Fen", "Irfan", "Divya", "Marcus", "Aina", "Haziq", "Yee Ling"],
  LK: ["Nuwan", "Dilani", "Kasun", "Ishara", "Ruwan", "Sachini", "Tharindu", "Nadeesha", "Chamara", "Hiruni", "Lahiru", "Anjali", "Dinesh", "Malsha", "Pradeep", "Shehani", "Sanjaya", "Thilini", "Upul", "Kavindi", "Asela", "Nimesha", "Buddhika", "Rashmi", "Gayan"],
  CY: ["Andreas", "Eleni", "Christos", "Maria", "Nikos", "Sofia", "Giorgos", "Katerina", "Panayiotis", "Despina", "Stelios", "Anna", "Michalis", "Ioanna", "Kyriacos", "Elena", "Marios", "Christina", "Petros", "Androulla", "Loizos", "Natasa", "Savvas", "Georgia", "Costas"],
};
const LAST: Record<CC, string[]> = {
  BD: ["Rahman", "Hossain", "Islam", "Ahmed", "Chowdhury", "Karim", "Sarker", "Akter", "Uddin", "Haque"],
  MY: ["Rahman", "Tan", "Lim", "Ismail", "Raj", "Wong", "Abdullah", "Lee", "Hassan", "Nair"],
  LK: ["Perera", "Fernando", "Silva", "Jayasinghe", "Wickramasinghe", "Bandara", "Dissanayake", "Gunawardena", "Ratnayake", "Herath"],
  CY: ["Georgiou", "Constantinou", "Christodoulou", "Ioannou", "Nicolaou", "Papadopoulos", "Charalambous", "Michael", "Kyriakou", "Demetriou"],
};

export type UserFixture = {
  key: string;
  name: string;
  email: string;
  role: "EMPLOYEE" | "MANAGER" | "HR_ADMIN";
  country: CC;
  dept: Dept;
  managerKey: string | null;
  joinedDaysAgo: number;
  status: "ACTIVE" | "ON_PROBATION" | "ON_NOTICE";
  recentHire: boolean;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "");

/**
 * 100 employees: 25 per country; 2 HR admins, 12 managers (3 per country), 86 employees.
 * Statuses: 75 ACTIVE, 20 ON_PROBATION (incl. the 8 recent hires), 5 ON_NOTICE.
 */
export function buildUsers(): UserFixture[] {
  const users: UserFixture[] = [];
  const used = new Set<string>();
  const email = (first: string, last: string) => {
    const base = `${slug(first)}.${slug(last)}`;
    let e = `${base}@example.com`;
    let n = 2;
    while (used.has(e)) e = `${base}${n++}@example.com`;
    used.add(e);
    return e;
  };
  const reserve = (e: string) => used.add(e);
  ["hr.admin@example.com", "hr.ops@example.com", "manager.my@example.com", "employee.my@example.com", "it.owner@example.com", "employee.cy@example.com"].forEach(reserve);

  users.push({ key: "hr-1", name: "Hana Yusof", email: "hr.admin@example.com", role: "HR_ADMIN", country: "MY", dept: "People & Culture", managerKey: null, joinedDaysAgo: 2400, status: "ACTIVE", recentHire: false });
  users.push({ key: "hr-2", name: "Eleni Pavlou", email: "hr.ops@example.com", role: "HR_ADMIN", country: "CY", dept: "People & Culture", managerKey: null, joinedDaysAgo: 1900, status: "ACTIVE", recentHire: false });

  const hrFor = (c: CC) => (c === "MY" || c === "BD" ? "hr-1" : "hr-2");
  const managerDepts: Dept[] = ["Engineering", "Finance", "IT"];
  const empDepts: Dept[] = ["Engineering", "IT", "People & Culture", "Finance", "Marketing", "Facilities", "Compliance"];
  const recentOffsets: Record<CC, [number, number]> = { MY: [34, 46], BD: [30, 50], LK: [38, 53], CY: [42, 55] };

  for (const { code: c } of [{ code: "BD" as CC }, { code: "MY" as CC }, { code: "LK" as CC }, { code: "CY" as CC }]) {
    const first = FIRST[c];
    const last = LAST[c];
    let nameIdx = 0;
    const nextName = () => {
      const f = first[nameIdx % first.length];
      const l = last[(nameIdx * 3 + 1) % last.length];
      nameIdx++;
      return { f, l, full: `${f} ${l}` };
    };
    // Managers
    managerDepts.forEach((d, i) => {
      const n = nextName();
      const isDemo = c === "MY" && d === "Engineering";
      users.push({
        key: `mgr-${c}-${i}`, name: n.full, email: isDemo ? "manager.my@example.com" : email(n.f, n.l), role: "MANAGER",
        country: c, dept: d, managerKey: hrFor(c), joinedDaysAgo: 1500 + i * 211, status: "ACTIVE", recentHire: false,
      });
    });
    const managerFor = (d: Dept) =>
      d === "Engineering" || d === "Marketing" ? `mgr-${c}-0` : d === "IT" || d === "Facilities" ? `mgr-${c}-2` : `mgr-${c}-1`;
    const count = c === "MY" || c === "CY" ? 21 : 22;
    for (let i = 0; i < count; i++) {
      const n = nextName();
      const d = empDepts[i % empDepts.length];
      let mail = email(n.f, n.l);
      let dept = d;
      let recentHire = false;
      let joinedDaysAgo = 120 + ((i * 97 + c.charCodeAt(0) * 13) % 2600);
      // Recent hires: two per country (indices 0 and 7 → Engineering hires so both templates apply).
      if (i === 0 || i === 9) {
        recentHire = true;
        joinedDaysAgo = recentOffsets[c][i === 0 ? 0 : 1];
      }
      if (c === "MY" && i === 0) mail = "employee.my@example.com";
      if (c === "MY" && i === 1) mail = "it.owner@example.com"; // i=1 → IT department
      if (c === "CY" && i === 3) mail = "employee.cy@example.com";
      if (recentHire && i === 9) dept = "Marketing";
      users.push({
        key: `emp-${c}-${i}`, name: n.full, email: mail, role: "EMPLOYEE", country: c, dept, managerKey: managerFor(dept),
        joinedDaysAgo, status: "ACTIVE", recentHire,
      });
    }
  }
  // employee.my reports to manager.my (Engineering) — already true via managerFor("Engineering").
  // Statuses: recent hires → probation; 12 more probation; 5 on notice.
  const nonRecentEmployees = users.filter((u) => u.role === "EMPLOYEE" && !u.recentHire && !u.email.startsWith("it.owner") && !u.email.startsWith("employee.cy"));
  users.filter((u) => u.recentHire).forEach((u) => (u.status = "ON_PROBATION"));
  nonRecentEmployees.slice(0, 12).forEach((u, i) => {
    u.status = "ON_PROBATION";
    u.joinedDaysAgo = 70 + i * 6; // joined 2–4 months ago, no checklist yet (available for HR to assign)
  });
  nonRecentEmployees.slice(-5).forEach((u) => (u.status = "ON_NOTICE"));
  return users;
}

export type TemplateTaskFixture = {
  key: string; title: string; description: string; dept: Dept; dueDay: number; prereqs: string[];
};

export const STANDARD_TEMPLATE: TemplateTaskFixture[] = [
  { key: "hr-profile", title: "Confirm employment details", description: "Verify contract, personal details and emergency contact in the HR record.", dept: "People & Culture", dueDay: 1, prereqs: [] },
  { key: "laptop", title: "Prepare laptop", description: "Image, label and enrol a laptop for the new hire.", dept: "IT", dueDay: 1, prereqs: ["hr-profile"] },
  { key: "account", title: "Create company account", description: "Create directory account, mailbox and MFA enrolment.", dept: "IT", dueDay: 1, prereqs: ["hr-profile"] },
  { key: "handover", title: "Hand over laptop and verify login", description: "Hand over the device and confirm the new hire can sign in.", dept: "IT", dueDay: 2, prereqs: ["laptop", "account"] },
  { key: "welcome", title: "Manager welcome and role expectations", description: "Introduce the team and agree first-month goals.", dept: "Manager", dueDay: 1, prereqs: [] },
  { key: "policies", title: "Review company policies", description: "Walk through the handbook and collect acknowledgements.", dept: "People & Culture", dueDay: 7, prereqs: ["hr-profile"] },
  { key: "security", title: "Complete security briefing", description: "Information security and acceptable-use briefing.", dept: "Compliance", dueDay: 7, prereqs: ["account"] },
  { key: "access", title: "Provision role-specific software", description: "Grant the applications this role needs.", dept: "IT", dueDay: 7, prereqs: ["account", "security"] },
  { key: "payroll", title: "Confirm payroll information", description: "Confirm bank and tax details with Finance.", dept: "Finance", dueDay: 7, prereqs: ["hr-profile"] },
  { key: "checkin", title: "Complete 30-day manager check-in", description: "Review progress against first-month goals.", dept: "Manager", dueDay: 30, prereqs: ["welcome", "policies"] },
];

export const ENGINEERING_TEMPLATE: TemplateTaskFixture[] = [
  ...STANDARD_TEMPLATE,
  { key: "dev-env", title: "Set up development environment", description: "Repository access, toolchain and local build.", dept: "Engineering", dueDay: 7, prereqs: ["handover", "access"] },
  { key: "first-change", title: "Ship a first small change", description: "Pair with a buddy to ship a reviewed change.", dept: "Engineering", dueDay: 14, prereqs: ["dev-env", "security"] },
];

/** Incomplete task keys per recent hire (index 0..7 in hire order); everything else completed. null = fully completed. */
export const ONBOARDING_PLAN: { incomplete: string[] | null; inProgress: string[] }[] = [
  { incomplete: ["account", "handover", "security", "access", "checkin", "dev-env", "first-change"], inProgress: ["account"] }, // employee.my (Engineering)
  { incomplete: ["checkin"], inProgress: ["checkin"] },
  { incomplete: ["payroll", "checkin"], inProgress: ["payroll"] },
  { incomplete: ["laptop", "handover", "access"], inProgress: [] },
  { incomplete: ["policies", "checkin"], inProgress: [] },
  { incomplete: ["access"], inProgress: ["access"] },
  { incomplete: null, inProgress: [] },
  { incomplete: null, inProgress: [] },
];

export type RequestFixture = {
  key: string; title: string; description: string; category: (typeof CATEGORIES)[number]["code"];
};

/**
 * Who raised a request: one of the recent hires (by onboarding order), a named demo
 * account, or the first matching person in a department / country / status / role.
 */
export type RequesterSpec =
  | { hire: number }
  | { email: string }
  | { dept?: Dept; country?: CC; status?: "ACTIVE" | "ON_PROBATION"; role?: "EMPLOYEE" | "MANAGER" };

/** One comment: by the assignee (A) or the requester (R), minutes after a lifecycle anchor (negative = before it). */
export type CommentLine = { by: "A" | "R"; after: "assigned" | "started" | "resolved"; min: number; text: string };

export type RequestPlan = {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  requester: RequesterSpec;
  thread?: CommentLine[];
};

/**
 * The 40 seeded requests, index-aligned with the seed's status blocks (8 each:
 * submitted, assigned, in progress, resolved, closed) and category plan. Each one is
 * written for its requester (department, country, tenure), its priority matches what it
 * describes (10 per priority), and its comments follow the request's own stage:
 * questions while assigned, progress while in progress, the fix before resolution and
 * the requester's confirmation before closing.
 */
export const REQUEST_PLAN: RequestPlan[] = [
  // ---- SUBMITTED (0–7): IT, SW, IT, HR, FAC, IT, SW, HR ----
  { title: "Laptop handover still pending", priority: "HIGH", requester: { hire: 0 },
    description: "IT prepared my laptop during my first week but I have not received it yet. I am still on a loaner that cannot run our build tools, so I cannot finish the engineering onboarding tasks." },
  { title: "Locked out of payroll system before pay run", priority: "URGENT", requester: { dept: "Finance", country: "BD" },
    description: "My payroll system account was locked after the password expiry this morning. This month's payroll has to be submitted by 5pm tomorrow." },
  { title: "Second monitor for code reviews", priority: "LOW", requester: { hire: 1 },
    description: "A second monitor would make side-by-side code reviews much easier. Not urgent; any standard 24-inch model is fine." },
  { title: "Annual leave balance looks wrong", priority: "MEDIUM", requester: { email: "employee.cy@example.com" },
    description: "My balance shows 6 days, but I carried over 3 days from last year, so I expected 9. Could you check the carry-over?" },
  { title: "Meeting room 3 air conditioning too cold", priority: "MEDIUM", requester: { dept: "Marketing", country: "MY" },
    description: "Meeting room 3 stays at about 17°C whatever the thermostat is set to. We have client workshops there this week." },
  { title: "Laptop will not boot after update", priority: "URGENT", requester: { dept: "Finance", country: "MY" },
    description: "After last night's update my laptop restarts in a loop and never reaches the sign-in screen. I cannot work at all today." },
  { title: "Design tool licence for campaign assets", priority: "HIGH", requester: { dept: "Marketing", country: "LK" },
    description: "I need a licence for the design tool to produce the assets for the campaign launching next Tuesday." },
  { title: "Probation review date", priority: "MEDIUM", requester: { status: "ON_PROBATION" },
    description: "My probation period ends next month. Could you confirm when my review is scheduled and who will run it?" },

  // ---- ASSIGNED (8–15): SW, IT, FAC, HR, IT, OT, SW, FAC ----
  { title: "VPN rejects my credentials after password change", priority: "URGENT", requester: { dept: "Engineering", country: "LK" },
    description: "Since I changed my password yesterday the VPN rejects my sign-in. I am working from home today and cannot reach any internal system.",
    thread: [
      { by: "A", after: "assigned", min: 25, text: "Can you send the exact error message and the VPN client version?" },
      { by: "R", after: "assigned", min: 40, text: "\"Authentication failed (code 691)\", client version 5.2. It started right after the password change." },
    ] },
  { title: "Headset for team calls", priority: "MEDIUM", requester: { hire: 2 },
    description: "I have daily calls with the team in Malaysia and my laptop microphone picks up a lot of background noise. Could I get a headset?" },
  { title: "Desk chair height adjustment broken", priority: "HIGH", requester: { dept: "Compliance", country: "CY" },
    description: "The gas lift on my chair no longer holds its height and it sinks during the day. It is giving me back pain.",
    thread: [
      { by: "A", after: "assigned", min: 30, text: "I can swap the chair tomorrow morning. Which desk are you at?" },
      { by: "R", after: "assigned", min: 55, text: "Desk 3.14, by the window. I am in from 9am." },
    ] },
  { title: "Update emergency contact", priority: "LOW", requester: { dept: "IT", country: "BD" },
    description: "I need to change my emergency contact to my sister. Is there a form, or can you update it from this request?" },
  { title: "Laptop not issued yet", priority: "URGENT", requester: { hire: 3 },
    description: "I joined six weeks ago and still do not have a laptop. I am borrowing a colleague's machine between their meetings.",
    thread: [
      { by: "A", after: "assigned", min: 20, text: "Sorry for the delay. Your laptop order is held at customs; the supplier expects delivery on Thursday." },
      { by: "R", after: "assigned", min: 45, text: "Thanks. Is there a loaner I could use until then?" },
      { by: "A", after: "assigned", min: 70, text: "Yes. A loaner is ready at the IT desk on level 1. Please collect it today." },
    ] },
  { title: "Business cards with new title", priority: "LOW", requester: { email: "employee.cy@example.com" },
    description: "I moved to Senior Accountant last month. Could you arrange 100 business cards with the new title?" },
  { title: "Repository write access", priority: "HIGH", requester: { dept: "Engineering", country: "MY" },
    description: "I need write access to the payments-service repository to push the fix for my current ticket. Read access works.",
    thread: [
      { by: "A", after: "assigned", min: 35, text: "Which ticket is this for? Write access to payments-service needs your manager's approval." },
      { by: "R", after: "assigned", min: 60, text: "Ticket PAY-482. My manager approved it in this morning's stand-up; I have asked them to confirm here." },
    ] },
  { title: "Access card not opening level 5", priority: "HIGH", requester: { dept: "Engineering", country: "MY", status: "ACTIVE" },
    description: "My access card opens the ground floor but not level 5, where my team sits. Reception has to let me in each morning." },

  // ---- IN PROGRESS (16–23): HR, IT, SW, FAC, IT, SW, HR, OT ----
  { title: "Parental leave entitlement", priority: "MEDIUM", requester: { dept: "IT", country: "LK" },
    description: "We are expecting our first child in March. How much parental leave am I entitled to, and how much notice do I need to give?",
    thread: [
      { by: "A", after: "started", min: 30, text: "Congratulations! I am confirming the Sri Lanka entitlement and the notice period with the benefits team and will reply here." },
      { by: "R", after: "started", min: 90, text: "Thank you, no rush this week." },
    ] },
  { title: "Sticky keys on issued laptop", priority: "MEDIUM", requester: { hire: 4 },
    description: "Several keys on the built-in keyboard of the laptop I was issued stick or double-type, mostly E and R.",
    thread: [
      { by: "A", after: "started", min: 20, text: "I have ordered a replacement keyboard. In the meantime I can lend you an external one." },
      { by: "R", after: "started", min: 50, text: "Yes please, that would help a lot." },
      { by: "A", after: "started", min: 120, text: "External keyboard left on your desk. The replacement part arrives on Wednesday and the swap takes about 30 minutes." },
    ] },
  { title: "Recruitment shared mailbox access", priority: "HIGH", requester: { dept: "People & Culture", country: "LK" },
    description: "Please add me to the recruitment shared mailbox. I am taking over graduate hiring from Monday.",
    thread: [
      { by: "A", after: "started", min: 40, text: "Access requested. The mailbox owner has to approve it; I have sent them a reminder." },
    ] },
  { title: "Leaking tap in level 2 pantry", priority: "URGENT", requester: { dept: "Finance", country: "CY" },
    description: "The pantry tap on level 2 is leaking steadily and water is pooling on the floor.",
    thread: [
      { by: "A", after: "started", min: 15, text: "I have closed the valve under the sink for now. The plumber is booked for 2pm today." },
      { by: "R", after: "started", min: 30, text: "Thanks, I have put a note on the pantry door." },
    ] },
  { title: "Laptop for contractor starting Monday", priority: "HIGH", requester: { role: "MANAGER", dept: "Finance", country: "CY" },
    description: "A contractor joins my team on Monday for three months and needs a standard laptop and an account.",
    thread: [
      { by: "A", after: "started", min: 45, text: "A standard laptop is reserved. Default image, or does the contractor need the finance reporting add-in too?" },
      { by: "R", after: "started", min: 80, text: "Default image plus the reporting add-in, please." },
      { by: "A", after: "started", min: 150, text: "Noted. It will be ready at the IT desk on Friday afternoon." },
    ] },
  { title: "Analytics dashboard regional filters missing", priority: "HIGH", requester: { dept: "Marketing", country: "BD" },
    description: "I can open the sales analytics dashboard but the regional filters are not shown, and I need them for Thursday's weekly report." },
  { title: "Unexpected deduction on payslip", priority: "HIGH", requester: { dept: "Engineering", country: "BD" },
    description: "My October payslip has a deduction labelled \"ADJ-02\" that I do not recognise. Could you explain it?",
    thread: [
      { by: "A", after: "started", min: 60, text: "ADJ-02 is the recovery of an overpaid allowance from August. I am checking the amount with payroll before confirming." },
      { by: "R", after: "started", min: 95, text: "Thanks. I did not know about the overpayment; please send the details when you have them." },
    ] },
  { title: "Remote work policy in Sinhala", priority: "MEDIUM", requester: { dept: "Facilities", country: "LK" },
    description: "Several of our facilities staff would find the remote work policy easier to follow in Sinhala. Can a translated copy be provided?" },

  // ---- RESOLVED (24–31): OT, FAC, HR, OT, SW, FAC, OT, HR — fixed, waiting for the requester to close ----
  { title: "Volunteer day registration", priority: "LOW", requester: { dept: "Engineering", country: "MY" },
    description: "How can our team register for the company volunteer day next month?",
    thread: [
      { by: "A", after: "resolved", min: -30, text: "I have sent you the registration form. Each team registers once with a list of names, by the 20th." },
    ] },
  { title: "Parking bay request", priority: "LOW", requester: { dept: "Marketing", country: "MY" },
    description: "I have started commuting by car. Could I be allocated a parking bay?",
    thread: [
      { by: "A", after: "resolved", min: -60, text: "Bay B2-17 is yours from Monday. Your parking pass is at reception." },
    ] },
  { title: "Employment letter for visa appointment", priority: "URGENT", requester: { dept: "Marketing", country: "MY" },
    description: "My visa appointment is in two days and I need an employment confirmation letter that states my salary.",
    thread: [
      { by: "A", after: "started", min: 30, text: "Which embassy is it for, and should the letter be addressed to them?" },
      { by: "R", after: "started", min: 50, text: "The German embassy in Kuala Lumpur. Yes, addressed to them please." },
      { by: "A", after: "resolved", min: -10, text: "The signed letter is in your inbox. Good luck with the appointment!" },
    ] },
  { title: "Expense category for client lunch", priority: "LOW", requester: { dept: "Marketing", country: "LK" },
    description: "Which expense category should I use for a lunch with a client?",
    thread: [
      { by: "A", after: "resolved", min: -20, text: "Use \"Client entertainment\" and add the client's company name in the notes." },
    ] },
  { title: "Facilities team vault in the password manager", priority: "MEDIUM", requester: { dept: "Facilities", country: "LK" },
    description: "Please add me to the Facilities team vault so I can reach the building management system logins." },
  { title: "Whiteboard markers and supplies on level 3", priority: "LOW", requester: { dept: "Compliance", country: "LK" },
    description: "None of the markers in the level 3 meeting rooms work, and the erasers are missing." },
  { title: "Branded items for university career fair", priority: "HIGH", requester: { dept: "People & Culture", country: "CY" },
    description: "We are at the University of Cyprus career fair on Friday and need branded pens, tote bags and a roll-up banner.",
    thread: [
      { by: "A", after: "started", min: 40, text: "Pens and tote bags are in stock. The banner is in the marketing store room; I will check it is the current design." },
      { by: "A", after: "resolved", min: -15, text: "Everything is boxed and waiting at reception, banner included." },
    ] },
  { title: "Training budget approval process", priority: "MEDIUM", requester: { dept: "Engineering", country: "CY" },
    description: "I would like to attend a cloud certification course in January. How do I apply for the annual training budget?",
    thread: [
      { by: "A", after: "resolved", min: -45, text: "Send the course details to your manager for approval, then submit the training form; applications for January close on 15 December." },
    ] },

  // ---- CLOSED (32–39): IT, OT, FAC, HR, OT, SW, FAC, OT — confirmed by the requester ----
  { title: "Laptop stolen while travelling", priority: "URGENT", requester: { dept: "Finance", country: "BD" },
    description: "My laptop was stolen at the airport on the way back from a client visit in Singapore. It needs a remote wipe and I need a replacement.",
    thread: [
      { by: "A", after: "started", min: 10, text: "The device is locked and the remote wipe has been sent. A replacement laptop will be ready this afternoon." },
      { by: "A", after: "resolved", min: -20, text: "Replacement handed over and your files restored from backup. Please also file a police report for insurance." },
      { by: "R", after: "resolved", min: 60, text: "All working, and the police report is filed. Thank you for the quick help." },
    ] },
  { title: "Mentoring programme sign-up", priority: "LOW", requester: { dept: "IT", country: "MY" },
    description: "I would like to join the mentoring programme as a mentee this cycle.",
    thread: [
      { by: "A", after: "resolved", min: -30, text: "You are registered. Your mentor will contact you in the first week of the cycle." },
      { by: "R", after: "resolved", min: 120, text: "Great, thanks!" },
    ] },
  { title: "Sparking power socket at desk", priority: "URGENT", requester: { dept: "Engineering", country: "BD" },
    description: "The power socket at desk 2.08 sparked when I plugged in my charger. I have stopped using it.",
    thread: [
      { by: "A", after: "started", min: 15, text: "Thanks for reporting it. The socket is isolated and taped off; the electrician is coming this afternoon." },
      { by: "A", after: "resolved", min: -10, text: "Socket replaced and tested by the electrician." },
      { by: "R", after: "resolved", min: 90, text: "Confirmed, it works fine now." },
    ] },
  { title: "Dependants missing on insurance portal", priority: "URGENT", requester: { dept: "Engineering", country: "MY" },
    description: "My spouse and son do not appear on the medical insurance portal, and my son has a clinic appointment this week.",
    thread: [
      { by: "A", after: "started", min: 30, text: "Your dependants were missing from the file we sent to the insurer this month. I have resubmitted it and asked for urgent processing." },
      { by: "A", after: "resolved", min: -15, text: "The insurer has confirmed. Both dependants are covered from the 1st." },
      { by: "R", after: "resolved", min: 75, text: "They show on the portal now. Thank you!" },
    ] },
  { title: "Lost umbrella in meeting room 2", priority: "LOW", requester: { dept: "Finance", country: "LK" },
    description: "I left a black umbrella in meeting room 2 yesterday afternoon.",
    thread: [
      { by: "A", after: "resolved", min: -20, text: "Found it. It is at reception under your name." },
      { by: "R", after: "resolved", min: 40, text: "Collected, thanks." },
    ] },
  { title: "Lost phone with MFA app", priority: "URGENT", requester: { dept: "People & Culture", country: "LK" },
    description: "I lost my phone last night and cannot complete multi-factor sign-in on my new phone.",
    thread: [
      { by: "A", after: "started", min: 20, text: "I have revoked the old device. Please call me so we can verify your identity and enrol the new phone." },
      { by: "R", after: "resolved", min: 30, text: "Enrolled and signed in. Thanks for sorting it out so fast." },
    ] },
  { title: "Locker near the gym", priority: "LOW", requester: { dept: "Finance", country: "LK" },
    description: "Could I have a locker near the gym area on the ground floor?" },
  { title: "Team offsite venue suggestions", priority: "MEDIUM", requester: { role: "MANAGER", dept: "IT", country: "BD" },
    description: "We are planning a one-day team offsite next quarter for 12 people. Is there a list of approved venues?",
    thread: [
      { by: "A", after: "resolved", min: -30, text: "The approved venue list and the booking form are on the intranet under Events. The Gulshan venue has a team discount." },
      { by: "R", after: "resolved", min: 180, text: "Booked the Gulshan venue. Thanks!" },
    ] },
];

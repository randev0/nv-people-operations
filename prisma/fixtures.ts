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
    let base = `${slug(first)}.${slug(last)}`;
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

/** Request texts by category; eight per category. */
export const REQUEST_TEXTS: Record<string, [string, string][]> = {
  IT_EQUIPMENT: [
    ["Laptop not delivered for first week", "I started recently and I am still using a shared machine. I need my own laptop to finish onboarding modules."],
    ["Second monitor request", "My role involves reviewing large spreadsheets; a second monitor would help. Not urgent."],
    ["Laptop battery drains within an hour", "Battery health shows 41%. I cannot attend meetings away from my desk."],
    ["Headset for customer calls", "I need a headset with a microphone for daily calls with customers."],
    ["Docking station not detecting display", "The dock at desk 4B does not output video since Monday. Tried two cables."],
    ["Replacement keyboard", "Several keys on my keyboard stick. Requesting a replacement."],
    ["Laptop for new contractor", "A contractor joins my team next week and needs a standard laptop."],
    ["Webcam for interviews", "I run interviews remotely and the built-in camera is very poor quality."],
  ],
  SOFTWARE_ACCESS: [
    ["Access to finance reporting tool", "I need read access to the monthly reporting workspace to prepare the budget review."],
    ["Design tool licence", "Requesting a licence for the design tool to produce campaign assets."],
    ["VPN access not working", "VPN rejects my credentials since the password change yesterday. Blocking remote work today."],
    ["Repository write access", "I need write access to the payments service repository for my current ticket."],
    ["Shared mailbox access", "Please add me to the recruitment shared mailbox."],
    ["Analytics dashboard permissions", "I can open the dashboard but cannot see the regional filters."],
    ["Password manager team vault", "Please add me to the Facilities team vault."],
    ["Project tracker account", "I do not have an account on the project tracker yet."],
  ],
  HR_QUERY: [
    ["Annual leave balance looks wrong", "My balance shows 6 days but I believe I should have 9 after carry-over."],
    ["Probation review date", "Could you confirm when my probation review is scheduled?"],
    ["Update emergency contact", "I need to change my emergency contact details."],
    ["Parental leave policy question", "I would like to understand the parental leave policy for my country."],
    ["Payslip clarification", "There is an allowance line on my payslip I do not recognise."],
    ["Employment letter for visa", "I need an employment confirmation letter for a visa application next month."],
    ["Training budget approval process", "How do I apply for the annual training budget?"],
    ["Medical insurance enrolment", "My dependants are not showing on the insurance portal."],
  ],
  FACILITIES: [
    ["Air conditioning too cold in meeting room 3", "Meeting room 3 stays at 17°C regardless of the thermostat setting."],
    ["Desk chair broken", "The height adjustment on my chair no longer holds."],
    ["Access card not opening level 5", "My access card works on the ground floor but not level 5."],
    ["Leaking tap in pantry", "The pantry tap on level 2 has been leaking since this morning."],
    ["Parking bay request", "Requesting a parking bay as I now commute by car."],
    ["Whiteboard markers and supplies", "Meeting rooms on level 3 have no working markers."],
    ["Light flickering above desk", "The ceiling light above row C flickers constantly."],
    ["Locker allocation", "I would like a locker near the gym area."],
  ],
  OTHER: [
    ["Team offsite venue suggestions", "Looking for guidance on approved venues for a team offsite next quarter."],
    ["Business card printing", "Please arrange business cards with my new title."],
    ["Volunteer day registration", "How can our team register for the company volunteer day?"],
    ["Expense claim category unclear", "Which category should I use for a client lunch?"],
    ["Company swag for event", "We need branded items for a university career fair."],
    ["Translation of policy document", "Can the remote work policy be provided in Sinhala?"],
    ["Mentoring programme sign-up", "I would like to join the mentoring programme as a mentee."],
    ["Lost and found", "I left a black umbrella in meeting room 2 yesterday."],
  ],
};

export const COMMENT_SCRIPTS: string[][] = [
  ["Thanks — I have picked this up and will check stock today.", "Stock arrives Thursday; I will reserve one for you.", "Great, thank you for the update."],
  ["Can you confirm the exact error message?", "It says 'authentication failed (code 691)'.", "Thanks, resetting the token now — please try again in 10 minutes."],
  ["Looking into it with the vendor.", "Vendor confirmed a replacement part is needed.", "Understood, please keep me posted."],
  ["I have checked the records; there was a carry-over error.", "Thanks for checking so quickly.", "Corrected — the balance now shows 9 days."],
  ["Technician scheduled for tomorrow morning.", "I will be at my desk from 9am.", "Fixed and tested, closing soon if all is well."],
  ["Which application is affected exactly?", "Only the regional view in the analytics dashboard.", "Permissions updated for the regional group."],
  ["Approved by your manager, proceeding.", "Do I need to collect it from IT?", "Yes, from the IT desk on level 2 after 2pm."],
  ["Received, will reply after checking the policy.", "Thank you.", "Policy summary sent by email; the key points are in this thread too."],
];

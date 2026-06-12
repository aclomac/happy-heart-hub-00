import { setCurrentCompanyId } from "@/lib/use-company";
import {
  addLocalUser,
  getLocalUsers,
  isValidEmail,
  normalizeMobile,
  setLocalUsers,
  userExists,
  validatePassword,
  type LocalUser,
} from "@/lib/demo/localUsers";
import {
  addDemoCompany,
  startLocalUserSession,
  type DemoCompany,
  type DemoSession,
} from "@/lib/demo/localStore";

export type SignupInput = {
  fullName: string;
  email: string;
  mobile?: string;
  password: string;
};

export type SignupErrors = Partial<Record<"name" | "email" | "password", string>>;

export function validateSignupInput(input: SignupInput): SignupErrors {
  const errors: SignupErrors = {};
  if (!input.fullName.trim()) errors.name = "Full Name is required";
  if (!input.email.trim()) errors.email = "Email is required";
  else if (!isValidEmail(input.email.trim())) errors.email = "Please enter a valid email";
  if (!validatePassword(input.password)) errors.password = "Password must be at least 8 characters";
  return errors;
}

export function createLocalSignupAccount(input: SignupInput): {
  user: LocalUser;
  company: DemoCompany;
  session: DemoSession;
} {
  const errors = validateSignupInput(input);
  if (Object.keys(errors).length) {
    throw new Error(Object.values(errors)[0] ?? "Invalid signup details");
  }

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const mobile = input.mobile ? normalizeMobile(input.mobile) : "";

  if (userExists(email, "")) {
    throw new Error("Account already exists. Please sign in.");
  }

  const created = addLocalUser({
    fullName,
    email,
    mobile,
    password: input.password,
    mobileVerified: false,
    isDemoUser: false,
  });

  const company = addDemoCompany({
    name: `${fullName}'s Business`,
    owner_id: created.id,
    email: created.email,
  });

  const user = { ...created, companyId: company.id, isDemoUser: false };
  setLocalUsers(getLocalUsers().map((u) => (u.id === user.id ? user : u)));

  const session = startLocalUserSession({
    id: user.id,
    email: user.email,
    name: user.fullName,
    fullName: user.fullName,
  });
  setCurrentCompanyId(company.id, user.id);

  return { user, company, session };
}
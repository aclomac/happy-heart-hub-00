import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Lang = "en" | "bn";

const LS_KEY = "erpovo.lang";

/**
 * Central translation dictionary.
 *
 * Keys are the canonical English text (also used as the fallback). When
 * adding new visible UI text, add a key here and reference it via t().
 *
 * Technical values (emails, invoice numbers, SKUs, route paths, API keys,
 * plan codes/enum values, file names, currency symbol) MUST NOT be added.
 */
export const DICTIONARY: Record<string, { en: string; bn: string }> = {
  // ───── Sidebar groups (legacy short keys, preserved for back-compat) ─────
  dashboard: { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  pos: { en: "POS", bn: "পিওএস" },
  parties: { en: "Parties", bn: "পার্টি" },
  items: { en: "Items", bn: "আইটেম" },
  sale: { en: "Sales", bn: "বিক্রয়" },
  purchase: { en: "Purchases", bn: "ক্রয়" },
  purchases: { en: "Purchases", bn: "ক্রয়" },
  expenses: { en: "Expenses", bn: "খরচ" },
  payroll: { en: "Payroll", bn: "পে-রোল" },
  hrm: { en: "HRM", bn: "এইচআরএম" },
  grow: { en: "Grow Your Business", bn: "ব্যবসা বাড়ান" },
  cash: { en: "Cash & Bank", bn: "ক্যাশ ও ব্যাংক" },
  cashbank: { en: "Cash & Bank", bn: "ক্যাশ ও ব্যাংক" },
  reports: { en: "Reports", bn: "রিপোর্ট" },
  sync: { en: "Sync, Share & Backup", bn: "সিঙ্ক, শেয়ার ও ব্যাকআপ" },
  utilities: { en: "Utilities", bn: "ইউটিলিটি" },
  settings: { en: "Settings", bn: "সেটিংস" },
  Settings: { en: "Settings", bn: "সেটিংস" },
  Reports: { en: "Reports", bn: "রিপোর্ট" },
  plans: { en: "Plans & Pricing", bn: "প্ল্যান ও প্রাইসিং" },
  subscription: { en: "Subscription", bn: "সাবস্ক্রিপশন" },
  support: { en: "Support", bn: "সাপোর্ট" },
  inventory: { en: "Inventory", bn: "ইনভেন্টরি" },

  // ───── Sidebar long labels ─────
  "Party Groups": { en: "Party Groups", bn: "পার্টি গ্রুপ" },
  "Item Categories": { en: "Item Categories", bn: "আইটেম ক্যাটাগরি" },
  "Stores / Warehouses": { en: "Stores / Warehouses", bn: "স্টোর / গুদাম" },
  "Stock Adjustments": { en: "Stock Adjustments", bn: "স্টক সমন্বয়" },
  "Stock Transfers": { en: "Stock Transfers", bn: "স্টক ট্রান্সফার" },
  "Stock Movement Ledger": { en: "Stock Movement Ledger", bn: "স্টক চলাচল লেজার" },
  "Sale Invoices": { en: "Sale Invoices", bn: "বিক্রয় ইনভয়েস" },
  "Estimates / Quotations": { en: "Estimates / Quotations", bn: "প্রাক্কলন / কোটেশন" },
  "Sale Orders": { en: "Sale Orders", bn: "বিক্রয় অর্ডার" },
  "Delivery Challans": { en: "Delivery Challans", bn: "ডেলিভারি চালান" },
  "Credit Notes / Sale Return": {
    en: "Credit Notes / Sale Return",
    bn: "ক্রেডিট নোট / সেল রিটার্ন",
  },
  "Payment In": { en: "Payment In", bn: "পেমেন্ট ইন" },
  "Sales Reports": { en: "Sales Reports", bn: "বিক্রয় রিপোর্ট" },
  "Purchase Bills": { en: "Purchase Bills", bn: "ক্রয় বিল" },
  "Purchase Orders": { en: "Purchase Orders", bn: "ক্রয় অর্ডার" },
  "Debit Notes / Return": { en: "Debit Notes / Return", bn: "ডেবিট নোট / রিটার্ন" },
  "Payment Out": { en: "Payment Out", bn: "পেমেন্ট আউট" },
  Expenses: { en: "Expenses", bn: "খরচ" },
  "Expense Categories": { en: "Expense Categories", bn: "খরচের ক্যাটাগরি" },
  "Purchase Reports": { en: "Purchase Reports", bn: "ক্রয় রিপোর্ট" },
  "Bank Accounts": { en: "Bank Accounts", bn: "ব্যাংক অ্যাকাউন্ট" },
  "Cash In Hand": { en: "Cash In Hand", bn: "হাতে নগদ" },
  Cheques: { en: "Cheques", bn: "চেক" },
  "Loan Accounts": { en: "Loan Accounts", bn: "ঋণ অ্যাকাউন্ট" },
  Employees: { en: "Employees", bn: "কর্মচারী" },
  Attendance: { en: "Attendance", bn: "উপস্থিতি" },
  "Salary Setup": { en: "Salary Setup", bn: "বেতন সেটআপ" },
  "Salary Payments": { en: "Salary Payments", bn: "বেতন পরিশোধ" },
  "Payroll Reports": { en: "Payroll Reports", bn: "পে-রোল রিপোর্ট" },
  "Transaction Reports": { en: "Transaction Reports", bn: "লেনদেন রিপোর্ট" },
  "Party Reports": { en: "Party Reports", bn: "পার্টি রিপোর্ট" },
  "Item / Stock Reports": { en: "Item / Stock Reports", bn: "আইটেম / স্টক রিপোর্ট" },
  "Business Status": { en: "Business Status", bn: "ব্যবসার অবস্থা" },
  "Tax Reports": { en: "Tax Reports", bn: "ট্যাক্স রিপোর্ট" },
  "Expense Reports": { en: "Expense Reports", bn: "খরচ রিপোর্ট" },
  "Inventory Reports": { en: "Inventory Reports", bn: "ইনভেন্টরি রিপোর্ট" },
  "Online Store": { en: "Online Store", bn: "অনলাইন স্টোর" },
  "Marketing Tools": { en: "Marketing Tools", bn: "মার্কেটিং টুলস" },
  "Share Online Store": { en: "Share Online Store", bn: "অনলাইন স্টোর শেয়ার করুন" },
  "Edit Store Info": { en: "Edit Store Info", bn: "স্টোর তথ্য এডিট করুন" },
  "Store Reports": { en: "Store Reports", bn: "স্টোর রিপোর্ট" },
  "Sync & Share": { en: "Sync & Share", bn: "সিঙ্ক ও শেয়ার" },
  "Auto Backup": { en: "Auto Backup", bn: "অটো ব্যাকআপ" },
  "Backup To Computer": { en: "Backup To Computer", bn: "কম্পিউটারে ব্যাকআপ" },
  "Backup To Drive": { en: "Backup To Drive", bn: "ড্রাইভে ব্যাকআপ" },
  "Restore Backup": { en: "Restore Backup", bn: "ব্যাকআপ পুনরুদ্ধার" },
  "All Utilities": { en: "All Utilities", bn: "সব ইউটিলিটি" },
  "Import Items": { en: "Import Items", bn: "আইটেম ইম্পোর্ট" },
  "Barcode Generator": { en: "Barcode Generator", bn: "বারকোড জেনারেটর" },
  "Update Items In Bulk": { en: "Update Items In Bulk", bn: "একসঙ্গে আইটেম আপডেট" },
  "Import Parties": { en: "Import Parties", bn: "পার্টি ইম্পোর্ট" },
  "Export Items": { en: "Export Items", bn: "আইটেম এক্সপোর্ট" },
  "Recycle Bin": { en: "Recycle Bin", bn: "রিসাইকেল বিন" },
  "Close Financial Year": { en: "Close Financial Year", bn: "অর্থবছর বন্ধ করুন" },
  "Payment Approvals": { en: "Payment Approvals", bn: "পেমেন্ট অনুমোদন" },
  "Payment Methods": { en: "Payment Methods", bn: "পেমেন্ট পদ্ধতি" },
  "Access Matrix": { en: "Access Matrix", bn: "অ্যাক্সেস ম্যাট্রিক্স" },
  "Security Tests": { en: "Security Tests", bn: "সিকিউরিটি টেস্ট" },
  "Audit History": { en: "Audit History", bn: "অডিট ইতিহাস" },
  Admin: { en: "Admin", bn: "অ্যাডমিন" },
  "Business ERP": { en: "Business ERP", bn: "বিজনেস ইআরপি" },

  // ───── Topbar / Quick actions ─────
  "Search Transactions, Parties, Items...": {
    en: "Search Transactions, Parties, Items...",
    bn: "লেনদেন, পার্টি, আইটেম সার্চ করুন...",
  },
  "Add Sale": { en: "Add Sale", bn: "বিক্রয় যোগ করুন" },
  "Add Other Income": { en: "Add Other Income", bn: "অন্যান্য আয় যোগ করুন" },
  "Other Income": { en: "Other Income", bn: "অন্যান্য আয়" },
  "Other Income Report": { en: "Other Income Report", bn: "অন্যান্য আয়ের রিপোর্ট" },
  "Income Category": { en: "Income Category", bn: "আয়ের ক্যাটাগরি" },
  "Category-wise Income": { en: "Category-wise Income", bn: "ক্যাটাগরি অনুযায়ী আয়" },
  "Source": { en: "Source", bn: "উৎস" },
  "No transactions in this period": { en: "No transactions in this period", bn: "এই সময়ে কোনো লেনদেন নেই" },
  "Add Category": { en: "Add Category", bn: "ক্যাটাগরি যোগ করুন" },
  "Category already exists": { en: "Category already exists", bn: "ক্যাটাগরি আগে থেকেই আছে" },
  "Factory Income": { en: "Factory Income", bn: "ফ্যাক্টরি আয়" },
  "Office Income": { en: "Office Income", bn: "অফিস আয়" },
  "Commission Income": { en: "Commission Income", bn: "কমিশন আয়" },
  "Amount": { en: "Amount", bn: "পরিমাণ" },
  "Payment Account": { en: "Payment Account", bn: "পেমেন্ট অ্যাকাউন্ট" },
  "Source / Party": { en: "Source / Party", bn: "উৎস / পার্টি" },
  "Notes": { en: "Notes", bn: "নোট" },
  "Income saved successfully": { en: "Income saved successfully", bn: "আয় সংরক্ষণ হয়েছে" },
  "Income updated successfully": { en: "Income updated successfully", bn: "আয় আপডেট হয়েছে" },
  "Income deleted successfully": { en: "Income deleted successfully", bn: "আয় মুছে ফেলা হয়েছে" },
  "Add Purchase": { en: "Add Purchase", bn: "ক্রয় যোগ করুন" },
  "Quick Add": { en: "Quick Add", bn: "দ্রুত যোগ করুন" },
  "New Sale Invoice": { en: "New Sale Invoice", bn: "নতুন বিক্রয় ইনভয়েস" },
  "New POS Sale": { en: "New POS Sale", bn: "নতুন POS বিক্রয়" },
  "New Purchase Bill": { en: "New Purchase Bill", bn: "নতুন ক্রয় বিল" },
  "New Estimate": { en: "New Estimate", bn: "নতুন প্রাক্কলন" },
  "Add Party": { en: "Add Party", bn: "পার্টি যোগ করুন" },
  "Add Item": { en: "Add Item", bn: "আইটেম যোগ করুন" },
  "Add Expense": { en: "Add Expense", bn: "খরচ যোগ করুন" },
  "Add Employee": { en: "Add Employee", bn: "কর্মচারী যোগ করুন" },
  "Sign out": { en: "Sign out", bn: "সাইন আউট" },
  "Company List": { en: "Company List", bn: "কোম্পানি তালিকা" },
  "Companies Shared with Me": {
    en: "Companies Shared with Me",
    bn: "আমার সাথে শেয়ার করা কোম্পানি",
  },
  "My Companies": { en: "My Companies", bn: "আমার কোম্পানি" },
  "Search Company": { en: "Search Company", bn: "কোম্পানি খুঁজুন" },
  "Current Company": { en: "Current Company", bn: "বর্তমান কোম্পানি" },
  "New Company": { en: "New Company", bn: "নতুন কোম্পানি" },

  "Last used": { en: "Last used", bn: "সর্বশেষ ব্যবহৃত" },
  "Rename Company": { en: "Rename Company", bn: "কোম্পানির নাম পরিবর্তন" },
  "Company switched successfully": {
    en: "Company switched successfully",
    bn: "কোম্পানি পরিবর্তন হয়েছে",
  },
  "Your previous company is no longer available. Please select another company.": {
    en: "Your previous company is no longer available. Please select another company.",
    bn: "আগের কোম্পানিটি এখন পাওয়া যাচ্ছে না। অন্য কোম্পানি নির্বাচন করুন।",
  },
  "Could not switch company. Please try again.": {
    en: "Could not switch company. Please try again.",
    bn: "কোম্পানি পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।",
  },
  "Upgrade your plan to add more companies.": {
    en: "Upgrade your plan to add more companies.",
    bn: "আরও কোম্পানি যোগ করতে আপনার প্ল্যান আপগ্রেড করুন।",
  },
  "Shared with me": { en: "Shared with me", bn: "আমার সাথে শেয়ার করা" },
  Synced: { en: "Synced", bn: "সিঙ্ক করা" },
  "Sync on": { en: "Sync on", bn: "সিঙ্ক চালু" },
  "Last synced": { en: "Last synced", bn: "সর্বশেষ সিঙ্ক" },
  "Company name": { en: "Company name", bn: "কোম্পানির নাম" },
  "Business type": { en: "Business type", bn: "ব্যবসার ধরন" },
  "TIN/BIN/VAT": { en: "TIN/BIN/VAT", bn: "টিআইএন/বিন/ভ্যাট" },
  Logo: { en: "Logo", bn: "লোগো" },
  "Company created successfully": {
    en: "Company created successfully",
    bn: "কোম্পানি সফলভাবে তৈরি করা হয়েছে",
  },
  "Company renamed successfully": {
    en: "Company renamed successfully",
    bn: "কোম্পানির নাম পরিবর্তন হয়েছে",
  },
  "Are you sure you want to switch to this company?": {
    en: "Are you sure you want to switch to this company?",
    bn: "আপনি কি নিশ্চিত যে আপনি এই কোম্পানিতে সুইচ করতে চান?",
  },
  "Restore backup will open the restore flow for the selected company. Continue?": {
    en: "Restore backup will open the restore flow for the selected company. Continue?",
    bn: "নির্বাচিত কোম্পানির জন্য ব্যাকআপ রিস্টোর পেজ খুলবে। চালিয়ে যাবেন?",
  },
  "Switching...": { en: "Switching...", bn: "পরিবর্তন হচ্ছে..." },
  Rename: { en: "Rename", bn: "নাম পরিবর্তন" },

  // ───── Common actions / buttons ─────
  Save: { en: "Save", bn: "সেভ করুন" },
  Cancel: { en: "Cancel", bn: "বাতিল" },
  Back: { en: "Back", bn: "ফিরে যান" },
  Delete: { en: "Delete", bn: "ডিলিট" },
  Edit: { en: "Edit", bn: "এডিট" },
  "View/Edit": { en: "View/Edit", bn: "দেখুন/এডিট" },
  View: { en: "View", bn: "দেখুন" },
  Duplicate: { en: "Duplicate", bn: "ডুপ্লিকেট" },
  Print: { en: "Print", bn: "প্রিন্ট" },
  Preview: { en: "Preview", bn: "প্রিভিউ" },
  Download: { en: "Download", bn: "ডাউনলোড" },
  Share: { en: "Share", bn: "শেয়ার" },
  Search: { en: "Search", bn: "সার্চ করুন" },
  Filter: { en: "Filter", bn: "ফিল্টার" },
  "Export CSV": { en: "Export CSV", bn: "CSV এক্সপোর্ট" },
  "Export PDF": { en: "Export PDF", bn: "PDF এক্সপোর্ট" },
  "Open PDF": { en: "Open PDF", bn: "PDF খুলুন" },
  "View History": { en: "View History", bn: "হিস্টরি দেখুন" },
  "Receive Payment": { en: "Receive Payment", bn: "পেমেন্ট গ্রহণ" },
  "Make Payment": { en: "Make Payment", bn: "পেমেন্ট করুন" },
  "Cancel Invoice": { en: "Cancel Invoice", bn: "ইনভয়েস বাতিল করুন" },
  Confirm: { en: "Confirm", bn: "নিশ্চিত করুন" },
  Yes: { en: "Yes", bn: "হ্যাঁ" },
  No: { en: "No", bn: "না" },
  Close: { en: "Close", bn: "বন্ধ করুন" },
  Apply: { en: "Apply", bn: "প্রয়োগ" },
  Reset: { en: "Reset", bn: "রিসেট" },
  Pending: { en: "Pending", bn: "অপেক্ষমাণ" },
  Confirmed: { en: "Confirmed", bn: "নিশ্চিত" },
  Packed: { en: "Packed", bn: "প্যাক করা হয়েছে" },
  Shipped: { en: "Shipped", bn: "পাঠানো হয়েছে" },
  Delivered: { en: "Delivered", bn: "ডেলিভারি সম্পন্ন" },
  Cancelled: { en: "Cancelled", bn: "বাতিল" },
  Returned: { en: "Returned", bn: "ফেরত" },
  "Return / Exchange": { en: "Return / Exchange", bn: "রিটার্ন / এক্সচেঞ্জ" },
  "Return Reason": { en: "Return Reason", bn: "রিটার্নের কারণ" },
  "Refund Amount": { en: "Refund Amount", bn: "রিফান্ড পরিমাণ" },
  "Refund Status": { en: "Refund Status", bn: "রিফান্ড স্ট্যাটাস" },
  Restock: { en: "Restock", bn: "স্টকে ফেরত" },
  Damaged: { en: "Damaged", bn: "ক্ষতিগ্রস্ত" },
  "Do not restock": { en: "Do not restock", bn: "স্টকে ফেরত নয়" },
  "Replacement Item": { en: "Replacement Item", bn: "পরিবর্তিত আইটেম" },
  "Price Difference": { en: "Price Difference", bn: "মূল্যের পার্থক্য" },
  "Refund Paid": { en: "Refund Paid", bn: "রিফান্ড পরিশোধ হয়েছে" },
  "Refund Pending": { en: "Refund Pending", bn: "রিফান্ড বাকি" },
  "Return saved": { en: "Return saved", bn: "রিটার্ন সংরক্ষণ হয়েছে" },
  "Exchange saved": { en: "Exchange saved", bn: "এক্সচেঞ্জ সংরক্ষণ হয়েছে" },
  "Wrong product": { en: "Wrong product", bn: "ভুল পণ্য" },
  "Damaged product": { en: "Damaged product", bn: "ক্ষতিগ্রস্ত পণ্য" },
  "Customer changed mind": { en: "Customer changed mind", bn: "ক্রেতা মত পরিবর্তন করেছেন" },
  "Size/color issue": { en: "Size/color issue", bn: "সাইজ/রঙের সমস্যা" },
  "Late delivery": { en: "Late delivery", bn: "দেরিতে ডেলিভারি" },
  Other: { en: "Other", bn: "অন্যান্য" },
  Exchange: { en: "Exchange", bn: "এক্সচেঞ্জ" },
  Refund: { en: "Refund", bn: "রিফান্ড" },
  "Restock Option": { en: "Restock Option", bn: "রিস্টক অপশন" },
  "Extra Payment": { en: "Extra Payment", bn: "অতিরিক্ত পেমেন্ট" },
  "Replacement Qty": { en: "Replacement Qty", bn: "পরিবর্তন পরিমাণ" },
  "Returned Qty": { en: "Returned Qty", bn: "ফেরত পরিমাণ" },
  Variants: { en: "Variants", bn: "ভ্যারিয়েন্ট" },
  "Add Variant": { en: "Add Variant", bn: "ভ্যারিয়েন্ট যোগ করুন" },
  "Variant Name": { en: "Variant Name", bn: "ভ্যারিয়েন্ট নাম" },
  "Variant SKU": { en: "Variant SKU", bn: "ভ্যারিয়েন্ট SKU" },
  Color: { en: "Color", bn: "রং" },
  Size: { en: "Size", bn: "সাইজ" },
  Model: { en: "Model", bn: "মডেল" },
  "Variant Stock": { en: "Variant Stock", bn: "ভ্যারিয়েন্ট স্টক" },
  "Variant SKU already exists": { en: "Variant SKU already exists", bn: "ভ্যারিয়েন্ট SKU আগে থেকেই আছে" },
  "Select Variant": { en: "Select Variant", bn: "ভ্যারিয়েন্ট নির্বাচন করুন" },
  "Variant saved": { en: "Variant saved", bn: "ভ্যারিয়েন্ট সংরক্ষণ হয়েছে" },
  "Order Status": { en: "Order Status", bn: "অর্ডারের অবস্থা" },
  "Status History": { en: "Status History", bn: "স্ট্যাটাস হিস্টরি" },
  "Change Status": { en: "Change Status", bn: "স্ট্যাটাস পরিবর্তন করুন" },
  "Order updated successfully": { en: "Order updated successfully", bn: "অর্ডার সফলভাবে আপডেট হয়েছে" },
  "Pending Orders": { en: "Pending Orders", bn: "অপেক্ষমাণ অর্ডার" },
  "Confirmed Orders": { en: "Confirmed Orders", bn: "নিশ্চিত অর্ডার" },
  "Shipped Orders": { en: "Shipped Orders", bn: "পাঠানো অর্ডার" },
  "Delivered Orders": { en: "Delivered Orders", bn: "ডেলিভারি সম্পন্ন অর্ডার" },
  "Returned Orders": { en: "Returned Orders", bn: "ফেরত আসা অর্ডার" },
  Language: { en: "Language", bn: "ভাষা" },
  Auto: { en: "Auto", bn: "অটো" },
  Bangla: { en: "Bangla", bn: "বাংলা" },
  English: { en: "English", bn: "ইংরেজি" },
  Refresh: { en: "Refresh", bn: "রিফ্রেশ" },
  Loading: { en: "Loading…", bn: "লোড হচ্ছে…" },
  LoadingDictionary: {
    en: "Loading translation dictionary...",
    bn: "অনুবাদ ডিকশনারি লোড হচ্ছে...",
  },
  "Install ERPOVO": { en: "Install ERPOVO", bn: "ERPOVO ইনস্টল করুন" },
  "Desktop App": { en: "Desktop App", bn: "ডেস্কটপ অ্যাপ" },
  Installed: { en: "Installed", bn: "ইনস্টল করা আছে" },
  "New version available": { en: "New version available", bn: "নতুন ভার্সন পাওয়া গেছে" },
  "Refresh to update": { en: "Refresh to update", bn: "আপডেট করতে রিফ্রেশ করুন" },
  "You are offline": { en: "You are offline", bn: "আপনি অফলাইনে আছেন" },
  "Please reconnect to continue": {
    en: "Please reconnect to continue",
    bn: "চালিয়ে যেতে পুনরায় ইন্টারনেট সংযোগ দিন",
  },
  "Install prompt not available": {
    en: "Install prompt not available",
    bn: "ইনস্টল প্রম্পট পাওয়া যাচ্ছে না",
  },
  "Browser not supported": { en: "Browser not supported", bn: "ব্রাউজারটি সাপোর্টেড নয়" },
  "ERPOVO is already running as a desktop app.": {
    en: "ERPOVO is already running as a desktop app.",
    bn: "ERPOVO ইতিমধ্যেই ডেস্কটপ অ্যাপ হিসেবে চলছে।",
  },
  "Show Install Instructions": {
    en: "Show Install Instructions",
    bn: "ইনস্টলেশন নির্দেশাবলী দেখুন",
  },
  "Hide Install Instructions": {
    en: "Hide Install Instructions",
    bn: "ইনস্টলেশন নির্দেশাবলী লুকান",
  },
  "Chrome/Edge menu ⋮ → Cast, save and share → Install ERPOVO / Install page as app.": {
    en: "Chrome/Edge menu ⋮ → Cast, save and share → Install ERPOVO / Install page as app.",
    bn: "ক্রোম/এজ মেনু ⋮ → Cast, save and share → Install ERPOVO / Install page as app।",
  },
  "Not installed": { en: "Not installed", bn: "ইনস্টল করা নেই" },
  "Install available": { en: "Install available", bn: "ইনস্টল করা যাবে" },
  "Please reconnect to sync your ERP data": {
    en: "Please reconnect to sync your ERP data",
    bn: "ERP ডাটা sync করতে ইন্টারনেট সংযোগ দিন",
  },
  "Install Desktop App": { en: "Install Desktop App", bn: "ডেস্কটপ অ্যাপ ইনস্টল করুন" },
  "How to install on Windows": {
    en: "How to install on Windows",
    bn: "উইন্ডোজে কীভাবে ইনস্টল করবেন",
  },
  "How to install on Mac": { en: "How to install on Mac", bn: "ম্যাকে কীভাবে ইনস্টল করবেন" },
  "How to create desktop shortcut": {
    en: "How to create desktop shortcut",
    bn: "কীভাবে ডেস্কটপ শর্টকাট তৈরি করবেন",
  },
  "Current install status": { en: "Current install status", bn: "বর্তমান ইনস্টল অবস্থা" },
  "Installation instructions": { en: "Installation instructions", bn: "ইনস্টলেশন নির্দেশাবলী" },
  "Open Chrome or Edge and click the install icon in the address bar.": {
    en: "Open Chrome or Edge and click the install icon in the address bar.",
    bn: "ক্রোম বা এজ খুলুন এবং অ্যাড্রেস বারে ইনস্টল আইকনে ক্লিক করুন।",
  },
  "Install ERPOVO on your computer for a faster, standalone experience.": {
    en: "Install ERPOVO on your computer for a faster, standalone experience.",
    bn: "দ্রুত এবং সহজ ব্যবহারের জন্য আপনার কম্পিউটারে ERPOVO ইনস্টল করুন।",
  },
  "Click 'Install' when prompted. ERPOVO will open in its own window.": {
    en: "Click 'Install' when prompted. ERPOVO will open in its own window.",
    bn: "'ইনস্টল' ক্লিক করুন। ERPOVO নিজস্ব উইন্ডোতে চালু হবে।",
  },
  "A shortcut will be added to your desktop and taskbar/dock.": {
    en: "A shortcut will be added to your desktop and taskbar/dock.",
    bn: "আপনার ডেস্কটপ এবং টাস্কবার/ডক-এ একটি শর্টকাট যোগ করা হবে।",
  },
  'Click the Install icon in Chrome/Edge address bar or the "Install" button above. Check your Start menu or Desktop for the ERPOVO icon.':
    {
      en: 'Click the Install icon in Chrome/Edge address bar or the "Install" button above. Check your Start menu or Desktop for the ERPOVO icon.',
      bn: 'ক্রোম/এজ অ্যাড্রেস বারে ইনস্টল আইকন বা উপরের "ইনস্টল" বাটনে ক্লিক করুন। আপনার স্টার্ট মেনু বা ডেস্কটপে ERPOVO আইকনটি খুঁজুন।',
    },
  'Click the Share button in Safari and "Add to Dock", or use the Install icon in Chrome.': {
    en: 'Click the Share button in Safari and "Add to Dock", or use the Install icon in Chrome.',
    bn: 'সাফারিতে শেয়ার বাটনে ক্লিক করে "Add to Dock" করুন, অথবা ক্রোমে ইনস্টল আইকন ব্যবহার করুন।',
  },
  Saving: { en: "Saving…", bn: "সেভ হচ্ছে…" },
  Actions: { en: "Actions", bn: "অ্যাকশন" },
  Product: { en: "Product", bn: "পণ্য" },
  Service: { en: "Service", bn: "সার্ভিস" },
  Pricing: { en: "Pricing", bn: "মূল্য" },
  Stock: { en: "Stock", bn: "স্টক" },
  Manufacturing: { en: "Manufacturing", bn: "ম্যানুফ্যাকচারিং" },
  "Add New Category": { en: "Add New Category", bn: "নতুন ক্যাটাগরি যোগ করুন" },
  "Item code already exists": { en: "Item code already exists", bn: "আইটেম কোড আগে থেকেই আছে" },
  "Please use a unique code": { en: "Please use a unique code", bn: "আলাদা কোড ব্যবহার করুন" },
  "Raw Material": { en: "Raw Material", bn: "কাঁচামাল" },
  "Estimated Cost": { en: "Estimated Cost", bn: "আনুমানিক খরচ" },
  "Additional Cost": { en: "Additional Cost", bn: "অতিরিক্ত খরচ" },
  "Opening Quantity": { en: "Opening Quantity", bn: "ওপেনিং পরিমাণ" },
  "Low Stock Alert": { en: "Low Stock Alert", bn: "কম স্টক সতর্কতা" },
  "Online Store Price": { en: "Online Store Price", bn: "অনলাইন স্টোর মূল্য" },
  "Add Item Image": { en: "Add Item Image", bn: "আইটেম ছবি যোগ করুন" },

  // ───── Empty / error states ─────
  "No data": { en: "No data", bn: "কোনো ডেটা নেই" },
  "No results": { en: "No results", bn: "কোনো ফলাফল নেই" },
  "Something went wrong": { en: "Something went wrong", bn: "কিছু একটা ভুল হয়েছে" },
  "Try again": { en: "Try again", bn: "আবার চেষ্টা করুন" },
  "Upgrade Required": { en: "Upgrade Required", bn: "আপগ্রেড প্রয়োজন" },
  "Upgrade Plan": { en: "Upgrade Plan", bn: "প্ল্যান আপগ্রেড" },
  "Subscription expired — renew to continue.": {
    en: "Subscription expired — renew to continue.",
    bn: "সাবস্ক্রিপশন শেষ — চালিয়ে যেতে নবায়ন করুন।",
  },
  "Upgrade Required — this feature is not in your current plan.": {
    en: "Upgrade Required — this feature is not in your current plan.",
    bn: "আপগ্রেড প্রয়োজন — এই ফিচারটি আপনার বর্তমান প্ল্যানে নেই।",
  },

  // ───── Payment menu copy ─────
  "Open Receipt PDF": { en: "Open Receipt PDF", bn: "রসিদ PDF খুলুন" },
  "Open Voucher PDF": { en: "Open Voucher PDF", bn: "ভাউচার PDF খুলুন" },
  "Preview Receipt": { en: "Preview Receipt", bn: "রসিদ প্রিভিউ" },
  "Preview Voucher": { en: "Preview Voucher", bn: "ভাউচার প্রিভিউ" },
  "Print Receipt": { en: "Print Receipt", bn: "রসিদ প্রিন্ট" },
  "Print Voucher": { en: "Print Voucher", bn: "ভাউচার প্রিন্ট" },
  "Receipt History": { en: "Receipt History", bn: "রসিদ হিস্টরি" },
  "Voucher History": { en: "Voucher History", bn: "ভাউচার হিস্টরি" },

  // ───── Super Admin ─────
  "Super Admin": { en: "Super Admin", bn: "সুপার অ্যাডমিন" },
  "Audit Logs": { en: "Audit Logs", bn: "অডিট লগ" },
  Customers: { en: "Customers", bn: "গ্রাহক" },
  Companies: { en: "Companies", bn: "কোম্পানি" },
  Plans: { en: "Plans", bn: "প্ল্যান" },
  Subscriptions: { en: "Subscriptions", bn: "সাবস্ক্রিপশন" },
  Payments: { en: "Payments", bn: "পেমেন্ট" },
  "Payment Gateways": { en: "Payment Gateways", bn: "পেমেন্ট গেটওয়ে" },
  Devices: { en: "Devices", bn: "ডিভাইস" },
  "Feature Control": { en: "Feature Control", bn: "ফিচার নিয়ন্ত্রণ" },
  Coupons: { en: "Coupons", bn: "কুপন" },
  Announcements: { en: "Announcements", bn: "ঘোষণা" },
  "Platform Admins": { en: "Platform Admins", bn: "প্ল্যাটফর্ম অ্যাডমিন" },
  Support: { en: "Support", bn: "সাপোর্ট" },
  "Back to ERP": { en: "← Back to ERP", bn: "← ERP এ ফিরে যান" },

  // ───── Module page titles ─────
  "POS · Point of Sale": { en: "POS · Point of Sale", bn: "পিওএস · পয়েন্ট অফ সেল" },
  Dashboard: { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  Sale: { en: "Sale", bn: "বিক্রয়" },
  Parties: { en: "Parties", bn: "পার্টি" },
  Items: { en: "Items", bn: "আইটেম" },
  Item: { en: "Item", bn: "আইটেম" },
  Party: { en: "Party", bn: "পার্টি" },
  Employee: { en: "Employee", bn: "কর্মচারী" },
  "Edit Expense": { en: "Edit Expense", bn: "খরচ এডিট" },
  "Salary Payment": { en: "Salary Payment", bn: "বেতন পরিশোধ" },
  "Salary Slip": { en: "Salary Slip", bn: "বেতন স্লিপ" },
  "Stock Adjustment": { en: "Stock Adjustment", bn: "স্টক সমন্বয়" },
  "Stock Transfer": { en: "Stock Transfer", bn: "স্টক ট্রান্সফার" },
  Cheque: { en: "Cheque", bn: "চেক" },
  "Loan Payment": { en: "Loan Payment", bn: "ঋণ পরিশোধ" },
  Transfer: { en: "Transfer", bn: "ট্রান্সফার" },
  "Subscription & Billing": { en: "Subscription & Billing", bn: "সাবস্ক্রিপশন ও বিলিং" },
  "Plans & Pricing": { en: "Plans & Pricing", bn: "প্ল্যান ও প্রাইসিং" },
  "Grow Your Business": { en: "Grow Your Business", bn: "ব্যবসা বৃদ্ধি" },
  "Sync, Share & Backup": { en: "Sync, Share & Backup", bn: "সিঙ্ক, শেয়ার ও ব্যাকআপ" },
  Utilities: { en: "Utilities", bn: "ইউটিলিটি" },
  "Bulk Update Items": { en: "Bulk Update Items", bn: "একসঙ্গে আইটেম আপডেট" },
  "Payroll & Employees": { en: "Payroll & Employees", bn: "পে-রোল ও কর্মচারী" },
  "Cash & Bank": { en: "Cash & Bank", bn: "ক্যাশ ও ব্যাংক" },

  // ───── Module subtitles ─────
  "Fast retail checkout": { en: "Fast retail checkout", bn: "দ্রুত রিটেইল চেকআউট" },
  "Operational spend, vendor payments and recurring outflow": {
    en: "Operational spend, vendor payments and recurring outflow",
    bn: "পরিচালন খরচ, বিক্রেতা পেমেন্ট এবং নিয়মিত বহিঃপ্রবাহ",
  },
  "Products, Services & Inventory": {
    en: "Products, Services & Inventory",
    bn: "পণ্য, সার্ভিস ও ইনভেন্টরি",
  },
  "Customers, Suppliers & Party Groups": {
    en: "Customers, Suppliers & Party Groups",
    bn: "গ্রাহক, সরবরাহকারী ও পার্টি গ্রুপ",
  },
  "Invoices, Quotations, Payments & Returns": {
    en: "Invoices, Quotations, Payments & Returns",
    bn: "ইনভয়েস, কোটেশন, পেমেন্ট ও রিটার্ন",
  },
  "Receive payments against customer invoices": {
    en: "Receive payments against customer invoices",
    bn: "গ্রাহকের ইনভয়েসের বিপরীতে পেমেন্ট গ্রহণ",
  },
  "Employees, attendance, salary setup & payments": {
    en: "Employees, attendance, salary setup & payments",
    bn: "কর্মচারী, উপস্থিতি, বেতন সেটআপ ও পরিশোধ",
  },
  "Business insights and financial reports": {
    en: "Business insights and financial reports",
    bn: "ব্যবসায়িক অন্তর্দৃষ্টি ও আর্থিক রিপোর্ট",
  },
  "Comprehensive sales analytics": {
    en: "Comprehensive sales analytics",
    bn: "বিস্তৃত বিক্রয় বিশ্লেষণ",
  },
  "Import, export, barcode, financial year tools": {
    en: "Import, export, barcode, financial year tools",
    bn: "ইম্পোর্ট, এক্সপোর্ট, বারকোড, অর্থবছর টুল",
  },
  "Download all items as a CSV file": {
    en: "Download all items as a CSV file",
    bn: "সব আইটেম CSV ফাইল হিসেবে ডাউনলোড",
  },
  "Company profile, taxes, users & preferences": {
    en: "Company profile, taxes, users & preferences",
    bn: "কোম্পানির প্রোফাইল, ট্যাক্স, ইউজার ও পছন্দ",
  },
  "Choose the plan that fits your business": {
    en: "Choose the plan that fits your business",
    bn: "আপনার ব্যবসার জন্য উপযুক্ত প্ল্যান বেছে নিন",
  },
  "Multi-user, devices and data backup": {
    en: "Multi-user, devices and data backup",
    bn: "মাল্টি-ইউজার, ডিভাইস ও ডেটা ব্যাকআপ",
  },
  "Online store, catalogue & marketing": {
    en: "Online store, catalogue & marketing",
    bn: "অনলাইন স্টোর, ক্যাটালগ ও মার্কেটিং",
  },
  "Restore or permanently remove deleted records": {
    en: "Restore or permanently remove deleted records",
    bn: "ডিলিট হওয়া রেকর্ড পুনরুদ্ধার বা চিরতরে মুছুন",
  },
  "All financial and business actions.": {
    en: "All financial and business actions.",
    bn: "সকল আর্থিক ও ব্যবসায়িক কার্যকলাপ।",
  },
  "Configure how users pay for upgrades": {
    en: "Configure how users pay for upgrades",
    bn: "ইউজার কীভাবে আপগ্রেডের জন্য পেমেন্ট করে তা কনফিগার করুন",
  },
  "Read-only detail view.": { en: "Read-only detail view.", bn: "রিড-অনলি বিস্তারিত ভিউ।" },

  // ───── Common table headers / filter labels ─────
  Date: { en: "Date", bn: "তারিখ" },
  Description: { en: "Description", bn: "বিবরণ" },
  
  Status: { en: "Status", bn: "স্ট্যাটাস" },
  Category: { en: "Category", bn: "ক্যাটাগরি" },
  Type: { en: "Type", bn: "টাইপ" },
  Name: { en: "Name", bn: "নাম" },
  Phone: { en: "Phone", bn: "ফোন" },
  Email: { en: "Email", bn: "ইমেইল" },
  Address: { en: "Address", bn: "ঠিকানা" },
  Balance: { en: "Balance", bn: "বাকি" },
  Action: { en: "Action", bn: "অ্যাকশন" },
  All: { en: "All", bn: "সব" },
  Quantity: { en: "Quantity", bn: "পরিমাণ" },
  Qty: { en: "Qty", bn: "পরিমাণ" },
  Price: { en: "Price", bn: "মূল্য" },
  Discount: { en: "Discount", bn: "ডিসকাউন্ট" },
  Tax: { en: "Tax", bn: "ট্যাক্স" },
  Total: { en: "Total", bn: "মোট" },
  Subtotal: { en: "Subtotal", bn: "সাবটোটাল" },
  "Grand Total": { en: "Grand Total", bn: "মোট" },
  Received: { en: "Received", bn: "গ্রহণ করা হয়েছে" },
  Refunded: { en: "Refunded", bn: "ফেরত দেওয়া হয়েছে" },
  Delivery: { en: "Delivery", bn: "ডেলিভারি" },
  "Balance/Due": { en: "Balance/Due", bn: "বাকি" },
  "Customer Due": { en: "Customer Due", bn: "কাস্টমারের বাকি" },
  "Credit Balance": { en: "Credit Balance", bn: "ক্রেডিট ব্যালেন্স" },
  Advance: { en: "Advance", bn: "অগ্রিম" },
  "Last Sale": { en: "Last Sale", bn: "সর্বশেষ বিক্রয়" },
  "Received amount cannot be negative": {
    en: "Received amount cannot be negative",
    bn: "গ্রহণ করা পরিমাণ ঋণাত্মক হতে পারে না",
  },
  "Received exceeds total — recorded as customer advance.": {
    en: "Received exceeds total — recorded as customer advance.",
    bn: "গ্রহণ করা পরিমাণ মোটের চেয়ে বেশি — কাস্টমারের অগ্রিম হিসেবে রেকর্ড হবে।",
  },
  "Billing Address": { en: "Billing Address", bn: "বিলিং ঠিকানা" },
  
  Reference: { en: "Reference", bn: "রেফারেন্স" },
  Method: { en: "Method", bn: "পদ্ধতি" },
  Account: { en: "Account", bn: "অ্যাকাউন্ট" },
  From: { en: "From", bn: "শুরু" },
  To: { en: "To", bn: "শেষ" },
  Created: { en: "Created", bn: "তৈরি" },
  Updated: { en: "Updated", bn: "আপডেট" },
  Number: { en: "Number", bn: "নম্বর" },
  Customer: { en: "Customer", bn: "গ্রাহক" },
  Supplier: { en: "Supplier", bn: "সরবরাহকারী" },
  "Show deleted": { en: "Show deleted", bn: "ডিলিট দেখান" },

  // ───── Empty states / messages ─────
  "No expenses": { en: "No expenses", bn: "কোনো খরচ নেই" },
  "No matching items": { en: "No matching items", bn: "মিলে যাওয়া কোনো আইটেম নেই" },
  "No items yet": { en: "No items yet", bn: "এখনও কোনো আইটেম নেই" },
  "No data found": { en: "No data found", bn: "কোনো ডাটা পাওয়া যায়নি" },
  "No transactions": { en: "No transactions", bn: "কোনো লেনদেন নেই" },
  "No payments": { en: "No payments", bn: "কোনো পেমেন্ট নেই" },
  "No invoices": { en: "No invoices", bn: "কোনো ইনভয়েস নেই" },
  "No employees": { en: "No employees", bn: "কোনো কর্মচারী নেই" },
  "No reports available": { en: "No reports available", bn: "কোনো রিপোর্ট নেই" },

  // ───── Super Admin — dashboard & common ─────
  "Platform Dashboard": { en: "Platform Dashboard", bn: "প্ল্যাটফর্ম ড্যাশবোর্ড" },
  "ERPOVO SaaS operations overview.": {
    en: "ERPOVO SaaS operations overview.",
    bn: "ERPOVO SaaS পরিচালনা পর্যালোচনা।",
  },
  "Loading stats…": { en: "Loading stats…", bn: "পরিসংখ্যান লোড হচ্ছে…" },
  "Total Customers": { en: "Total Customers", bn: "মোট গ্রাহক" },
  "Total Companies": { en: "Total Companies", bn: "মোট কোম্পানি" },
  "Active Subscriptions": { en: "Active Subscriptions", bn: "সক্রিয় সাবস্ক্রিপশন" },
  "Trial Companies": { en: "Trial Companies", bn: "ট্রায়াল কোম্পানি" },
  Expired: { en: "Expired", bn: "মেয়াদোত্তীর্ণ" },
  "Active Plans": { en: "Active Plans", bn: "সক্রিয় প্ল্যান" },
  "Pending Payments": { en: "Pending Payments", bn: "অপেক্ষমাণ পেমেন্ট" },
  "Active Devices (7d)": { en: "Active Devices (7d)", bn: "সক্রিয় ডিভাইস (৭দিন)" },
  "Under Review": { en: "Under Review", bn: "রিভিউ চলছে" },
  "Approved this month": { en: "Approved this month", bn: "এই মাসে অনুমোদিত" },
  "Monthly Revenue": { en: "Monthly Revenue", bn: "মাসিক আয়" },
  "Yearly Revenue": { en: "Yearly Revenue", bn: "বার্ষিক আয়" },
  "Expiring in 7 days": { en: "Expiring in 7 days", bn: "৭ দিনে মেয়াদ শেষ" },
  "Coupon Redemptions": { en: "Coupon Redemptions", bn: "কুপন ব্যবহার" },
  "Plan-wise subscriptions": { en: "Plan-wise subscriptions", bn: "প্ল্যান অনুযায়ী সাবস্ক্রিপশন" },
  "No subscriptions yet.": { en: "No subscriptions yet.", bn: "এখনো কোনো সাবস্ক্রিপশন নেই।" },
  "Recent companies": { en: "Recent companies", bn: "সাম্প্রতিক কোম্পানি" },
  "None.": { en: "None.", bn: "কিছু নেই।" },
  "Recent audit events": { en: "Recent audit events", bn: "সাম্প্রতিক অডিট ইভেন্ট" },
  "No audit events yet.": { en: "No audit events yet.", bn: "এখনো কোনো অডিট ইভেন্ট নেই।" },

  // ───── Super Admin — customers / companies ─────
  "Registered users on the ERPOVO platform.": {
    en: "Registered users on the ERPOVO platform.",
    bn: "ERPOVO প্ল্যাটফর্মে নিবন্ধিত ব্যবহারকারী।",
  },
  "Search by name or phone…": {
    en: "Search by name or phone…",
    bn: "নাম বা ফোন দিয়ে সার্চ করুন…",
  },
  Signup: { en: "Signup", bn: "সাইনআপ" },
  "No customers found.": { en: "No customers found.", bn: "কোনো গ্রাহক পাওয়া যায়নি।" },
  Unnamed: { en: "Unnamed", bn: "নামবিহীন" },
  Plan: { en: "Plan", bn: "প্ল্যান" },
  Expires: { en: "Expires", bn: "মেয়াদ শেষ" },
  "No subscription.": { en: "No subscription.", bn: "কোনো সাবস্ক্রিপশন নেই।" },
  "Owned companies": { en: "Owned companies", bn: "মালিকানাধীন কোম্পানি" },
  "Audit history": { en: "Audit history", bn: "অডিট ইতিহাস" },
  "No audit entries.": { en: "No audit entries.", bn: "কোনো অডিট এন্ট্রি নেই।" },

  // ───── Super Admin — actions ─────
  Approve: { en: "Approve", bn: "অনুমোদন করুন" },
  Reject: { en: "Reject", bn: "বাতিল করুন" },
  "Mark Under Review": { en: "Mark Under Review", bn: "রিভিউতে দিন" },
  Enable: { en: "Enable", bn: "চালু করুন" },
  Disable: { en: "Disable", bn: "বন্ধ করুন" },
  "Remove Device": { en: "Remove Device", bn: "ডিভাইস রিমুভ করুন" },
  "Reset Devices": { en: "Reset Devices", bn: "ডিভাইস রিসেট করুন" },
  "View Details": { en: "View Details", bn: "বিস্তারিত দেখুন" },
  "Save Changes": { en: "Save Changes", bn: "পরিবর্তন সেভ করুন" },

  // ───── Super Admin — security / secrets ─────
  "API Key": { en: "API Key", bn: "API কী" },
  "Webhook Secret": { en: "Webhook Secret", bn: "ওয়েবহুক সিক্রেট" },
  Masked: { en: "Masked", bn: "মাস্ক করা" },
  "Hidden for security": { en: "Hidden for security", bn: "নিরাপত্তার জন্য লুকানো" },

  // ───── Super Admin — dialogs ─────
  "Are you sure?": { en: "Are you sure?", bn: "আপনি কি নিশ্চিত?" },
  "This action cannot be undone.": {
    en: "This action cannot be undone.",
    bn: "এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।",
  },
  "Reason (optional)": { en: "Reason (optional)", bn: "কারণ (ঐচ্ছিক)" },

  // ───── Super Admin — Payments ─────
  "Subscription Payments": { en: "Subscription Payments", bn: "সাবস্ক্রিপশন পেমেন্ট" },
  "Review and approve customer payment requests": {
    en: "Review and approve customer payment requests",
    bn: "গ্রাহকের পেমেন্ট অনুরোধ পর্যালোচনা ও অনুমোদন",
  },
  
  Approved: { en: "Approved", bn: "অনুমোদিত" },
  Rejected: { en: "Rejected", bn: "প্রত্যাখ্যাত" },
  "Company / User": { en: "Company / User", bn: "কোম্পানি / ইউজার" },
  "Txn ID": { en: "Txn ID", bn: "ট্রানজ্যাকশন আইডি" },
  Submitted: { en: "Submitted", bn: "জমা দেওয়া" },
  Review: { en: "Review", bn: "রিভিউ" },
  "Open receipt": { en: "Open receipt", bn: "রসিদ খুলুন" },
  "No payment requests in this tab.": {
    en: "No payment requests in this tab.",
    bn: "এই ট্যাবে কোনো পেমেন্ট অনুরোধ নেই।",
  },
  "Reject payment": { en: "Reject payment", bn: "পেমেন্ট বাতিল করুন" },
  "Reason (shown to customer)": {
    en: "Reason (shown to customer)",
    bn: "কারণ (গ্রাহককে দেখানো হবে)",
  },
  "e.g. Transaction ID not found in bKash records.": {
    en: "e.g. Transaction ID not found in bKash records.",
    bn: "যেমন: bKash রেকর্ডে ট্রানজ্যাকশন আইডি পাওয়া যায়নি।",
  },
  "Payment proof": { en: "Payment proof", bn: "পেমেন্ট প্রমাণ" },
  "Payment approved — subscription activated": {
    en: "Payment approved — subscription activated",
    bn: "পেমেন্ট অনুমোদিত — সাবস্ক্রিপশন সক্রিয়",
  },
  "Payment rejected": { en: "Payment rejected", bn: "পেমেন্ট বাতিল" },
  "Marked under review": { en: "Marked under review", bn: "রিভিউতে চিহ্নিত" },

  // ───── Super Admin — Coupons ─────
  "Discount codes for the upgrade form.": {
    en: "Discount codes for the upgrade form.",
    bn: "আপগ্রেড ফর্মের জন্য ডিসকাউন্ট কোড।",
  },
  "New / Update Coupon": { en: "New / Update Coupon", bn: "নতুন / আপডেট কুপন" },
  "Percentage %": { en: "Percentage %", bn: "শতাংশ %" },
  "Flat amount": { en: "Flat amount", bn: "নির্দিষ্ট পরিমাণ" },
  "Valid until": { en: "Valid until", bn: "মেয়াদ" },
  "Max uses (blank = unlimited)": {
    en: "Max uses (blank = unlimited)",
    bn: "সর্বাধিক ব্যবহার (ফাঁকা = সীমাহীন)",
  },
  "Plan key restriction (e.g. pro)": {
    en: "Plan key restriction (e.g. pro)",
    bn: "প্ল্যান কী সীমা (যেমন: pro)",
  },
  "Any billing period": { en: "Any billing period", bn: "যেকোনো বিলিং পিরিয়ড" },
  "Monthly only": { en: "Monthly only", bn: "শুধু মাসিক" },
  "Yearly only": { en: "Yearly only", bn: "শুধু বার্ষিক" },
  "Internal note": { en: "Internal note", bn: "অভ্যন্তরীণ নোট" },
  "Save coupon": { en: "Save coupon", bn: "কুপন সেভ করুন" },
  "Active Coupons": { en: "Active Coupons", bn: "সক্রিয় কুপন" },
  Code: { en: "Code", bn: "কোড" },
  "Plan / Period": { en: "Plan / Period", bn: "প্ল্যান / পিরিয়ড" },
  Uses: { en: "Uses", bn: "ব্যবহার" },
  Active: { en: "Active", bn: "সক্রিয়" },
  "No coupons yet.": { en: "No coupons yet.", bn: "এখনও কোনো কুপন নেই।" },
  "Coupon saved": { en: "Coupon saved", bn: "কুপন সেভ হয়েছে" },
  "Coupon disabled": { en: "Coupon disabled", bn: "কুপন বন্ধ করা হয়েছে" },

  // ───── Super Admin — Devices ─────
  "All registered devices across customers.": {
    en: "All registered devices across customers.",
    bn: "সব গ্রাহকের নিবন্ধিত ডিভাইস।",
  },
  "Prune devices stale > 30 days": {
    en: "Prune devices stale > 30 days",
    bn: "৩০ দিনের বেশি নিষ্ক্রিয় ডিভাইস মুছুন",
  },
  Filters: { en: "Filters", bn: "ফিল্টার" },
  "Search by customer, company, device name, fingerprint…": {
    en: "Search by customer, company, device name, fingerprint…",
    bn: "গ্রাহক, কোম্পানি, ডিভাইস নাম, ফিঙ্গারপ্রিন্ট সার্চ করুন…",
  },
  "Stale only (> 30d)": { en: "Stale only (> 30d)", bn: "শুধু নিষ্ক্রিয় (> ৩০ দিন)" },
  "Company / Plan": { en: "Company / Plan", bn: "কোম্পানি / প্ল্যান" },
  Device: { en: "Device", bn: "ডিভাইস" },
  Fingerprint: { en: "Fingerprint", bn: "ফিঙ্গারপ্রিন্ট" },
  "Last seen": { en: "Last seen", bn: "শেষ সক্রিয়" },
  limit: { en: "limit", bn: "সীমা" },
  "Remove this device": { en: "Remove this device", bn: "এই ডিভাইসটি রিমুভ করুন" },
  "Reset all devices for this user": {
    en: "Reset all devices for this user",
    bn: "এই ইউজারের সব ডিভাইস রিসেট করুন",
  },
  "Reset all devices for the first company": {
    en: "Reset all devices for the first company",
    bn: "প্রথম কোম্পানির সব ডিভাইস রিসেট করুন",
  },
  "Reset co": { en: "Reset co", bn: "কোম্পানি রিসেট" },
  "No devices match these filters.": {
    en: "No devices match these filters.",
    bn: "এই ফিল্টারে কোনো ডিভাইস নেই।",
  },
  "Device removed": { en: "Device removed", bn: "ডিভাইস রিমুভ করা হয়েছে" },

  // ───── Super Admin — Reports ─────
  "Platform Reports": { en: "Platform Reports", bn: "প্ল্যাটফর্ম রিপোর্ট" },
  "Revenue, subscriptions, devices and coupon usage.": {
    en: "Revenue, subscriptions, devices and coupon usage.",
    bn: "আয়, সাবস্ক্রিপশন, ডিভাইস ও কুপন ব্যবহার।",
  },
  Revenue: { en: "Revenue", bn: "আয়" },
  "Plan revenue": { en: "Plan revenue", bn: "প্ল্যান আয়" },
  "Customer growth": { en: "Customer growth", bn: "গ্রাহক বৃদ্ধি" },
  Gateways: { en: "Gateways", bn: "গেটওয়ে" },
  "Pending payments": { en: "Pending payments", bn: "অপেক্ষমান পেমেন্ট" },
  "Print / PDF": { en: "Print / PDF", bn: "প্রিন্ট / PDF" },
  Trial: { en: "Trial", bn: "ট্রায়াল" },
  "Expiring 7d": { en: "Expiring 7d", bn: "৭ দিনে মেয়াদ" },
  "Total devices": { en: "Total devices", bn: "মোট ডিভাইস" },
  "Active (7d)": { en: "Active (7d)", bn: "সক্রিয় (৭ দিন)" },
  "Nothing to export": { en: "Nothing to export", bn: "এক্সপোর্ট করার কিছু নেই" },
  "Nothing to print": { en: "Nothing to print", bn: "প্রিন্ট করার কিছু নেই" },
  "No data for the selected range.": {
    en: "No data for the selected range.",
    bn: "নির্বাচিত পরিসরে কোনো ডেটা নেই।",
  },

  // ───── Super Admin — Plans page ─────
  "Subscription plans and feature toggles.": {
    en: "Subscription plans and feature toggles.",
    bn: "সাবস্ক্রিপশন প্ল্যান ও ফিচার টগল।",
  },
  "+ Add plan": { en: "+ Add plan", bn: "+ প্ল্যান যোগ করুন" },
  "Add plan": { en: "Add plan", bn: "প্ল্যান যোগ করুন" },
  Monthly: { en: "Monthly", bn: "মাসিক" },
  Yearly: { en: "Yearly", bn: "বার্ষিক" },
  "Active features": { en: "Active features", bn: "সক্রিয় ফিচার" },
  Key: { en: "Key", bn: "কী" },
  Label: { en: "Label", bn: "লেবেল" },
  "Monthly price": { en: "Monthly price", bn: "মাসিক মূল্য" },
  "Yearly price": { en: "Yearly price", bn: "বার্ষিক মূল্য" },
  "Trial days": { en: "Trial days", bn: "ট্রায়াল দিন" },
  "Company limit": { en: "Company limit", bn: "কোম্পানি সীমা" },
  "Device limit": { en: "Device limit", bn: "ডিভাইস সীমা" },
  "User limit": { en: "User limit", bn: "ইউজার সীমা" },
  "Feature toggles": { en: "Feature toggles", bn: "ফিচার টগল" },
  "Plan saved": { en: "Plan saved", bn: "প্ল্যান সেভ হয়েছে" },
  "Plan deleted": { en: "Plan deleted", bn: "প্ল্যান ডিলিট হয়েছে" },

  // ───── Super Admin — Payment Gateways ─────
  "Manage payment methods customers can use to pay for subscriptions": {
    en: "Manage payment methods customers can use to pay for subscriptions",
    bn: "গ্রাহকরা যে পেমেন্ট পদ্ধতিতে সাবস্ক্রিপশনের টাকা পরিশোধ করবে তা পরিচালনা করুন",
  },
  "New gateway": { en: "New gateway", bn: "নতুন গেটওয়ে" },
  "Edit gateway": { en: "Edit gateway", bn: "গেটওয়ে এডিট" },
  Limits: { en: "Limits", bn: "সীমা" },
  Mode: { en: "Mode", bn: "মোড" },
  Sandbox: { en: "Sandbox", bn: "স্যান্ডবক্স" },
  Live: { en: "Live", bn: "লাইভ" },
  Enabled: { en: "Enabled", bn: "চালু" },
  Disabled: { en: "Disabled", bn: "বন্ধ" },
  "No gateways configured yet.": {
    en: "No gateways configured yet.",
    bn: "এখনো কোনো গেটওয়ে কনফিগার করা হয়নি।",
  },
  "Display label": { en: "Display label", bn: "ডিসপ্লে লেবেল" },
  "Method key": { en: "Method key", bn: "মেথড কী" },
  "Payment type": { en: "Payment type", bn: "পেমেন্ট টাইপ" },
  "Sort order": { en: "Sort order", bn: "সর্ট অর্ডার" },
  "Account number / merchant ID": {
    en: "Account number / merchant ID",
    bn: "অ্যাকাউন্ট নম্বর / মার্চেন্ট আইডি",
  },
  "Account name": { en: "Account name", bn: "অ্যাকাউন্ট নাম" },
  "Min amount": { en: "Min amount", bn: "সর্বনিম্ন পরিমাণ" },
  "Max amount (blank = unlimited)": {
    en: "Max amount (blank = unlimited)",
    bn: "সর্বোচ্চ পরিমাণ (ফাঁকা = সীমাহীন)",
  },
  "Logo URL": { en: "Logo URL", bn: "লোগো URL" },
  "Instructions to customer": {
    en: "Instructions to customer",
    bn: "গ্রাহকের জন্য নির্দেশনা",
  },
  "Secrets are write-only. Leave blank to keep the existing value.": {
    en: "Secrets are write-only. Leave blank to keep the existing value.",
    bn: "সিক্রেট শুধু লেখা যায়। বিদ্যমান মান রাখতে ফাঁকা রাখুন।",
  },
  "Webhook secret": { en: "Webhook secret", bn: "ওয়েবহুক সিক্রেট" },
  "Sandbox mode": { en: "Sandbox mode", bn: "স্যান্ডবক্স মোড" },
  "Gateway saved": { en: "Gateway saved", bn: "গেটওয়ে সেভ হয়েছে" },
  "Gateway deleted": { en: "Gateway deleted", bn: "গেটওয়ে ডিলিট হয়েছে" },
  "Saving…": { en: "Saving…", bn: "সেভ হচ্ছে…" },

  // ───── Super Admin — Support ─────
  "Support Tickets": { en: "Support Tickets", bn: "সাপোর্ট টিকেট" },
  "Customer support inbox for platform admins.": {
    en: "Customer support inbox for platform admins.",
    bn: "প্ল্যাটফর্ম অ্যাডমিনদের জন্য কাস্টমার সাপোর্ট ইনবক্স।",
  },
  "All statuses": { en: "All statuses", bn: "সব স্ট্যাটাস" },
  Inbox: { en: "Inbox", bn: "ইনবক্স" },
  Subject: { en: "Subject", bn: "বিষয়" },
  "Loading…": { en: "Loading…", bn: "লোড হচ্ছে…" },
  "No tickets.": { en: "No tickets.", bn: "কোনো টিকেট নেই।" },
  "Select a ticket to view details.": {
    en: "Select a ticket to view details.",
    bn: "বিস্তারিত দেখতে একটি টিকেট নির্বাচন করুন।",
  },
  "Your reply": { en: "Your reply", bn: "আপনার উত্তর" },
  "Type a reply or internal note…": {
    en: "Type a reply or internal note…",
    bn: "উত্তর বা অভ্যন্তরীণ নোট টাইপ করুন…",
  },
  "Internal note (hidden from customer)": {
    en: "Internal note (hidden from customer)",
    bn: "অভ্যন্তরীণ নোট (গ্রাহকের কাছে লুকানো)",
  },
  Send: { en: "Send", bn: "পাঠান" },
  "Reply sent": { en: "Reply sent", bn: "উত্তর পাঠানো হয়েছে" },
  "Status updated": { en: "Status updated", bn: "স্ট্যাটাস আপডেট হয়েছে" },
  "No messages yet.": { en: "No messages yet.", bn: "এখনো কোনো বার্তা নেই।" },
  Reply: { en: "Reply", bn: "উত্তর" },
  priority: { en: "priority", bn: "প্রাইওরিটি" },
  open: { en: "open", bn: "ওপেন" },
  in_progress: { en: "in progress", bn: "চলমান" },
  waiting_customer: { en: "waiting customer", bn: "গ্রাহকের অপেক্ষায়" },
  resolved: { en: "resolved", bn: "সমাধান" },
  closed: { en: "closed", bn: "বন্ধ" },

  // ───── Super Admin — Announcements ─────
  "Platform-wide notices shown in user dashboards.": {
    en: "Platform-wide notices shown in user dashboards.",
    bn: "ব্যবহারকারীর ড্যাশবোর্ডে প্রদর্শিত প্ল্যাটফর্মব্যাপী বিজ্ঞপ্তি।",
  },
  "New announcement": { en: "New announcement", bn: "নতুন ঘোষণা" },
  "All announcements": { en: "All announcements", bn: "সব ঘোষণা" },
  Title: { en: "Title", bn: "শিরোনাম" },
  Message: { en: "Message", bn: "বার্তা" },
  Audience: { en: "Audience", bn: "টার্গেট" },
  "All users": { en: "All users", bn: "সব ইউজার" },
  "Specific plan": { en: "Specific plan", bn: "নির্দিষ্ট প্ল্যান" },
  "Trial users": { en: "Trial users", bn: "ট্রায়াল ইউজার" },
  "Expired users": { en: "Expired users", bn: "মেয়াদোত্তীর্ণ ইউজার" },
  "Target plan key": { en: "Target plan key", bn: "টার্গেট প্ল্যান কী" },
  "Starts at": { en: "Starts at", bn: "শুরু" },
  "Ends at": { en: "Ends at", bn: "শেষ" },
  Dismissible: { en: "Dismissible", bn: "বন্ধযোগ্য" },
  Create: { en: "Create", bn: "তৈরি করুন" },
  Window: { en: "Window", bn: "সময়সীমা" },
  Info: { en: "Info", bn: "তথ্য" },
  Warning: { en: "Warning", bn: "সতর্কতা" },
  Success: { en: "Success", bn: "সফল" },
  Maintenance: { en: "Maintenance", bn: "মেইনটেন্যান্স" },
  "No announcements yet.": { en: "No announcements yet.", bn: "এখনো কোনো ঘোষণা নেই।" },
  "Announcement created": { en: "Announcement created", bn: "ঘোষণা তৈরি হয়েছে" },
  Deleted: { en: "Deleted", bn: "ডিলিট হয়েছে" },
  "Delete this announcement?": {
    en: "Delete this announcement?",
    bn: "এই ঘোষণাটি ডিলিট করবেন?",
  },

  // ───── Super Admin — Platform Settings ─────
  "Platform Settings": { en: "Platform Settings", bn: "প্ল্যাটফর্ম সেটিংস" },
  "Branding, support contacts, defaults, and platform-wide toggles.": {
    en: "Branding, support contacts, defaults, and platform-wide toggles.",
    bn: "ব্র্যান্ডিং, সাপোর্ট যোগাযোগ, ডিফল্ট ও প্ল্যাটফর্মব্যাপী টগল।",
  },
  Branding: { en: "Branding", bn: "ব্র্যান্ডিং" },
  "Platform name and logo.": { en: "Platform name and logo.", bn: "প্ল্যাটফর্ম নাম ও লোগো।" },
  "Platform name": { en: "Platform name", bn: "প্ল্যাটফর্ম নাম" },
  "Support contacts": { en: "Support contacts", bn: "সাপোর্ট যোগাযোগ" },
  "Support email": { en: "Support email", bn: "সাপোর্ট ইমেইল" },
  "Support phone": { en: "Support phone", bn: "সাপোর্ট ফোন" },
  "Support WhatsApp": { en: "Support WhatsApp", bn: "সাপোর্ট হোয়াটসঅ্যাপ" },
  "Terms URL": { en: "Terms URL", bn: "শর্তাবলী URL" },
  "Privacy URL": { en: "Privacy URL", bn: "প্রাইভেসি URL" },
  Defaults: { en: "Defaults", bn: "ডিফল্ট" },
  Currency: { en: "Currency", bn: "মুদ্রা" },
  Timezone: { en: "Timezone", bn: "টাইমজোন" },
  "Invoice prefix": { en: "Invoice prefix", bn: "ইনভয়েস প্রিফিক্স" },
  "Receipt prefix": { en: "Receipt prefix", bn: "রসিদ প্রিফিক্স" },
  "System toggles": { en: "System toggles", bn: "সিস্টেম টগল" },
  "Maintenance mode blocks all ERP users with a notice. Platform admins always bypass.": {
    en: "Maintenance mode blocks all ERP users with a notice. Platform admins always bypass.",
    bn: "মেইনটেন্যান্স মোড সব ERP ইউজারকে নোটিশসহ ব্লক করে। প্ল্যাটফর্ম অ্যাডমিন সবসময় বাইপাস।",
  },
  "Maintenance mode": { en: "Maintenance mode", bn: "মেইনটেন্যান্স মোড" },
  "Maintenance message": { en: "Maintenance message", bn: "মেইনটেন্যান্স বার্তা" },
  "Allow new signups": { en: "Allow new signups", bn: "নতুন সাইনআপ অনুমতি" },
  "Enable demo login": { en: "Enable demo login", bn: "ডেমো লগইন চালু" },
  "Save changes": { en: "Save changes", bn: "পরিবর্তন সেভ করুন" },
  "Settings saved": { en: "Settings saved", bn: "সেটিংস সেভ হয়েছে" },

  // ───── Sale Invoice Customization ─────
  "Sale Invoice Customization": {
    en: "Sale Invoice Customization",
    bn: "সেল ইনভয়েস কাস্টমাইজেশন",
  },
  "Turn fields, columns and sections on or off. Off fields are hidden on the form and on printed/PDF invoices.":
    {
      en: "Turn fields, columns and sections on or off. Off fields are hidden on the form and on printed/PDF invoices.",
      bn: "ফিল্ড, কলাম ও সেকশন চালু/বন্ধ করুন। বন্ধ ফিল্ড ফর্ম ও প্রিন্ট/PDF এ দেখা যাবে না।",
    },
  "Back to Settings": { en: "Back to Settings", bn: "সেটিংসে ফিরে যান" },
  "Reset to defaults": { en: "Reset to defaults", bn: "ডিফল্ট রিসেট" },
  "You don't have permission to change these settings. View only.": {
    en: "You don't have permission to change these settings. View only.",
    bn: "আপনার এই সেটিংস পরিবর্তনের অনুমতি নেই। শুধু দেখা যাবে।",
  },
  "Header fields": { en: "Header fields", bn: "হেডার ফিল্ড" },
  "Item table": { en: "Item table", bn: "আইটেম টেবিল" },
  Totals: { en: "Totals", bn: "মোট" },
  Footer: { en: "Footer", bn: "ফুটার" },
  "Billing Name (optional)": { en: "Billing Name (optional)", bn: "বিলিং নাম (ঐচ্ছিক)" },
  "PO No.": { en: "PO No.", bn: "PO নং" },
  "PO Date": { en: "PO Date", bn: "PO তারিখ" },
  "Payment Terms": { en: "Payment Terms", bn: "পেমেন্ট শর্ত" },
  "Due Date": { en: "Due Date", bn: "শেষ তারিখ" },
  "Store / Warehouse selector": {
    en: "Store / Warehouse selector",
    bn: "স্টোর / ওয়্যারহাউস সিলেক্টর",
  },
  "Description column": { en: "Description column", bn: "বিবরণ কলাম" },
  "Discount column": { en: "Discount column", bn: "ডিসকাউন্ট কলাম" },
  "Tax / VAT column": { en: "Tax / VAT column", bn: "ট্যাক্স / VAT কলাম" },
  "Delivery Charge": { en: "Delivery Charge", bn: "ডেলিভারি চার্জ" },
  "Labor Cost": { en: "Labor Cost", bn: "শ্রম খরচ" },
  "Terms & Conditions": { en: "Terms & Conditions", bn: "শর্তাবলী" },
  "Billing Name": { en: "Billing Name", bn: "বিলিং নাম" },
  "Optional — defaults to customer name": {
    en: "Optional — defaults to customer name",
    bn: "ঐচ্ছিক — ডিফল্ট কাস্টমার নাম",
  },
  "Notes / Terms & Conditions…": {
    en: "Notes / Terms & Conditions…",
    bn: "নোট / শর্তাবলী…",
  },
  "Delivery / Other Charge": { en: "Delivery / Other Charge", bn: "ডেলিভারি / অন্যান্য চার্জ" },
  "Due on Receipt": { en: "Due on Receipt", bn: "প্রাপ্তিতে পরিশোধ" },
  "Net 7": { en: "Net 7", bn: "নেট ৭" },
  "Net 15": { en: "Net 15", bn: "নেট ১৫" },
  "Net 30": { en: "Net 30", bn: "নেট ৩০" },
  "Net 45": { en: "Net 45", bn: "নেট ৪৫" },
  "Net 60": { en: "Net 60", bn: "নেট ৬০" },
  Custom: { en: "Custom", bn: "কাস্টম" },
  "Invoice Number Series": { en: "Invoice Number Series", bn: "ইনভয়েস নম্বর সিরিজ" },
  Prefix: { en: "Prefix", bn: "প্রিফিক্স" },
  "Starting Number": { en: "Starting Number", bn: "শুরুর নম্বর" },
  "Number Padding": { en: "Number Padding", bn: "নম্বর প্যাডিং" },
  "Next Number Preview": { en: "Next Number Preview", bn: "পরবর্তী নম্বর প্রিভিউ" },
  "Duplicate invoice number": { en: "Duplicate invoice number", bn: "একই ইনভয়েস নম্বর আছে" },
  "Reset/Change next number": {
    en: "Reset/Change next number",
    bn: "পরবর্তী নম্বর রিসেট/পরিবর্তন",
  },
  "Existing invoices will not be renumbered. New invoices will continue from this number (if higher than the highest existing number).":
    {
      en: "Existing invoices will not be renumbered. New invoices will continue from this number (if higher than the highest existing number).",
      bn: "বিদ্যমান ইনভয়েস পুনঃনম্বরিত হবে না। নতুন ইনভয়েস এই নম্বর থেকে চলবে (যদি বিদ্যমান সর্বোচ্চের চেয়ে বড় হয়)।",
    },

  // ───── Purchase Bill Customization ─────
  "Purchase Bill Customization": {
    en: "Purchase Bill Customization",
    bn: "পারচেজ বিল কাস্টমাইজেশন",
  },
  "Purchase Bill Settings": { en: "Purchase Bill Settings", bn: "পারচেজ বিল সেটিংস" },
  "Turn fields, columns and sections on or off. Off fields are hidden on the form and on printed/PDF bills.":
    {
      en: "Turn fields, columns and sections on or off. Off fields are hidden on the form and on printed/PDF bills.",
      bn: "ফিল্ড, কলাম ও সেকশন চালু/বন্ধ করুন। বন্ধ ফিল্ড ফর্ম ও প্রিন্ট/PDF বিল-এ দেখা যাবে না।",
    },

  // ───── Super Admin — Audit Logs ─────
  "Platform Audit Logs": { en: "Platform Audit Logs", bn: "প্ল্যাটফর্ম অডিট লগ" },
  "Platform admin actions and (where allowed) company audit logs.": {
    en: "Platform admin actions and (where allowed) company audit logs.",
    bn: "প্ল্যাটফর্ম অ্যাডমিন অ্যাকশন এবং (যেখানে অনুমতি আছে) কোম্পানি অডিট লগ।",
  },
  "CSV (page)": { en: "CSV (page)", bn: "CSV (পেজ)" },
  "CSV (all filtered)": { en: "CSV (all filtered)", bn: "CSV (সব ফিল্টার)" },
  Scope: { en: "Scope", bn: "স্কোপ" },
  Platform: { en: "Platform", bn: "প্ল্যাটফর্ম" },
  "Company (app)": { en: "Company (app)", bn: "কোম্পানি (অ্যাপ)" },
  "All companies": { en: "All companies", bn: "সব কোম্পানি" },
  Sort: { en: "Sort", bn: "সর্ট" },
  "Newest first": { en: "Newest first", bn: "নতুন আগে" },
  "Oldest first": { en: "Oldest first", bn: "পুরোনো আগে" },
  "Entity / Target": { en: "Entity / Target", bn: "এন্টিটি / টার্গেট" },
  User: { en: "User", bn: "ইউজার" },
  Company: { en: "Company", bn: "কোম্পানি" },
  "Page size": { en: "Page size", bn: "পেজ সাইজ" },
  Time: { en: "Time", bn: "সময়" },
  "Target / Reference": { en: "Target / Reference", bn: "টার্গেট / রেফারেন্স" },
  Metadata: { en: "Metadata", bn: "মেটাডেটা" },
  "No audit entries match the filters.": {
    en: "No audit entries match the filters.",
    bn: "ফিল্টারের সাথে কোনো অডিট এন্ট্রি মেলে না।",
  },
  Previous: { en: "Previous", bn: "পূর্ববর্তী" },
  Next: { en: "Next", bn: "পরবর্তী" },
  "Audit entry detail": { en: "Audit entry detail", bn: "অডিট এন্ট্রি বিস্তারিত" },
  "Metadata (sensitive fields masked)": {
    en: "Metadata (sensitive fields masked)",
    bn: "মেটাডেটা (সংবেদনশীল ফিল্ড মাস্ক করা)",
  },
  "Nothing to export on this page": {
    en: "Nothing to export on this page",
    bn: "এই পেজে এক্সপোর্ট করার কিছু নেই",
  },
  "Nothing matches the current filters": {
    en: "Nothing matches the current filters",
    bn: "বর্তমান ফিল্টারে কিছু মেলে না",
  },
  "Access restricted": { en: "Access restricted", bn: "প্রবেশ সীমাবদ্ধ" },
  "Only platform admins can view audit logs.": {
    en: "Only platform admins can view audit logs.",
    bn: "শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিনরা অডিট লগ দেখতে পারেন।",
  },

  // ───── Super Admin — Detail pages (common) ─────
  History: { en: "History", bn: "ইতিহাস" },
  Extend: { en: "Extend", bn: "বাড়ান" },
  "Mark trial": { en: "Mark trial", bn: "ট্রায়াল চিহ্নিত" },
  "Mark active": { en: "Mark active", bn: "সক্রিয় চিহ্নিত" },
  "Mark expired": { en: "Mark expired", bn: "মেয়াদোত্তীর্ণ চিহ্নিত" },
  Subscription: { en: "Subscription", bn: "সাবস্ক্রিপশন" },
  "Company profile": { en: "Company profile", bn: "কোম্পানি প্রোফাইল" },
  "Subscription controls": { en: "Subscription controls", bn: "সাবস্ক্রিপশন নিয়ন্ত্রণ" },
  "Change plan": { en: "Change plan", bn: "প্ল্যান পরিবর্তন" },
  "Select plan…": { en: "Select plan…", bn: "প্ল্যান নির্বাচন করুন…" },
  "Extend by (days)": { en: "Extend by (days)", bn: "বাড়ান (দিন)" },
  "Plan changed": { en: "Plan changed", bn: "প্ল্যান পরিবর্তিত" },
  "Subscription extended": { en: "Subscription extended", bn: "সাবস্ক্রিপশন বাড়ানো হয়েছে" },
  "Max companies": { en: "Max companies", bn: "সর্বাধিক কোম্পানি" },
  "No subscription on file.": {
    en: "No subscription on file.",
    bn: "কোনো সাবস্ক্রিপশন ফাইলে নেই।",
  },
  "No audit entries for this company.": {
    en: "No audit entries for this company.",
    bn: "এই কোম্পানির জন্য কোনো অডিট এন্ট্রি নেই।",
  },
  Unknown: { en: "Unknown", bn: "অজানা" },
  Owner: { en: "Owner", bn: "মালিক" },

  // ───── Super Admin — Coupon detail ─────
  Coupon: { en: "Coupon", bn: "কুপন" },
  "Active coupon": { en: "Active coupon", bn: "সক্রিয় কুপন" },
  "Disabled — cannot be applied by customers": {
    en: "Disabled — cannot be applied by customers",
    bn: "বন্ধ — গ্রাহক প্রয়োগ করতে পারবেন না",
  },
  "Coupon not found.": { en: "Coupon not found.", bn: "কুপন পাওয়া যায়নি।" },
  "Discount type": { en: "Discount type", bn: "ডিসকাউন্ট টাইপ" },
  "Discount value": { en: "Discount value", bn: "ডিসকাউন্ট মান" },
  "Valid from": { en: "Valid from", bn: "শুরু" },
  "Max uses": { en: "Max uses", bn: "সর্বাধিক ব্যবহার" },
  "Used count": { en: "Used count", bn: "ব্যবহৃত" },
  "Billing period": { en: "Billing period", bn: "বিলিং পিরিয়ড" },
  "Restricted company": { en: "Restricted company", bn: "সীমাবদ্ধ কোম্পানি" },
  "Restricted user": { en: "Restricted user", bn: "সীমাবদ্ধ ইউজার" },
  "Redemption history": { en: "Redemption history", bn: "রিডেম্পশন ইতিহাস" },
  "No redemptions yet.": { en: "No redemptions yet.", bn: "এখনো কোনো রিডেম্পশন নেই।" },
  "Coupon enabled": { en: "Coupon enabled", bn: "কুপন চালু করা হয়েছে" },

  // ───── Super Admin — Device detail ─────
  "Device not found.": { en: "Device not found.", bn: "ডিভাইস পাওয়া যায়নি।" },
  "Remove device": { en: "Remove device", bn: "ডিভাইস রিমুভ" },
  "Reset company devices": { en: "Reset company devices", bn: "কোম্পানির ডিভাইস রিসেট" },
  "Device name": { en: "Device name", bn: "ডিভাইস নাম" },
  "Remove this device?": { en: "Remove this device?", bn: "এই ডিভাইসটি রিমুভ করবেন?" },
  "The user will be signed out of this device on next check-in. This action is audit-logged.": {
    en: "The user will be signed out of this device on next check-in. This action is audit-logged.",
    bn: "পরবর্তী চেক-ইনে ইউজার এই ডিভাইস থেকে সাইন আউট হবেন। অডিট লগে রেকর্ড থাকবে।",
  },
  "Warning: this device was active in the last 24 hours and may be a live session.": {
    en: "Warning: this device was active in the last 24 hours and may be a live session.",
    bn: "সতর্কতা: এই ডিভাইসটি গত ২৪ ঘণ্টায় সক্রিয় ছিল, লাইভ সেশন হতে পারে।",
  },
  Remove: { en: "Remove", bn: "রিমুভ" },
  "All devices registered for this company's owner will be removed. They will need to sign in again on each device. This action is audit-logged.":
    {
      en: "All devices registered for this company's owner will be removed. They will need to sign in again on each device. This action is audit-logged.",
      bn: "এই কোম্পানির মালিকের সব নিবন্ধিত ডিভাইস রিমুভ হবে। প্রতিটি ডিভাইসে আবার সাইন ইন করতে হবে। অডিট লগে রেকর্ড থাকবে।",
    },

  // ───── Super Admin — Payment detail ─────
  "Platform Payment": { en: "Platform Payment", bn: "প্ল্যাটফর্ম পেমেন্ট" },
  "Payment not found.": { en: "Payment not found.", bn: "পেমেন্ট পাওয়া যায়নি।" },
  "Mark under review": { en: "Mark under review", bn: "রিভিউতে চিহ্নিত করুন" },
  "View receipt": { en: "View receipt", bn: "রসিদ দেখুন" },
  "Original amount": { en: "Original amount", bn: "মূল পরিমাণ" },
  "Transaction ID": { en: "Transaction ID", bn: "ট্রানজ্যাকশন আইডি" },
  "Sender info": { en: "Sender info", bn: "প্রেরকের তথ্য" },
  "Reviewed by": { en: "Reviewed by", bn: "রিভিউকারী" },
  "Reviewed at": { en: "Reviewed at", bn: "রিভিউ সময়" },
  "Submitted at": { en: "Submitted at", bn: "জমার সময়" },
  "Admin note": { en: "Admin note", bn: "অ্যাডমিন নোট" },
  "Reject reason": { en: "Reject reason", bn: "প্রত্যাখ্যানের কারণ" },
  "A reason is required.": { en: "A reason is required.", bn: "একটি কারণ প্রয়োজন।" },
  "Proof not available": { en: "Proof not available", bn: "প্রমাণ পাওয়া যায়নি" },

  // ───── Marketing & Online Store ─────
  "WhatsApp Store Share": { en: "WhatsApp Store Share", bn: "হোয়াটসঅ্যাপ স্টোর শেয়ার" },
  "Facebook Post": { en: "Facebook Post", bn: "ফেসবুক পোস্ট" },
  "Customer Promotional Message": { en: "Customer Promotional Message", bn: "কাস্টমার প্রমোশনাল মেসেজ" },
  "Offer Banner Text": { en: "Offer Banner Text", bn: "অফার ব্যানার টেক্সট" },
  "Festival Offer": { en: "Festival Offer", bn: "উৎসবের অফার" },
  "Copy Text": { en: "Copy Text", bn: "টেক্সট কপি করুন" },
  "Template copied to clipboard": { en: "Template copied to clipboard", bn: "টেমপ্লেট ক্লিপবোর্ডে কপি হয়েছে" },
  "Hello! Check out our online store: {{url}}. You can browse our products and place orders directly.": {
    en: "Hello! Check out our online store: {{url}}. You can browse our products and place orders directly.",
    bn: "আসসালামু আলাইকুম! আমাদের অনলাইন স্টোরটি ভিজিট করুন: {{url}}। আপনি আমাদের পণ্যগুলো দেখতে পারেন এবং সরাসরি অর্ডার করতে পারেন।",
  },
  "Exciting news! Our online store is now live at {{url}}. Visit us to see our latest collections!": {
    en: "Exciting news! Our online store is now live at {{url}}. Visit us to see our latest collections!",
    bn: "সুসংবাদ! আমাদের অনলাইন স্টোর এখন লাইভ: {{url}}। আমাদের সর্বশেষ কালেকশন দেখতে ভিজিট করুন!",
  },
  "Special offer for you! Browse our store and get the best deals: {{url}}": {
    en: "Special offer for you! Browse our store and get the best deals: {{url}}",
    bn: "আপনার জন্য বিশেষ অফার! আমাদের স্টোর ভিজিট করুন এবং সেরা ডিলগুলো দেখুন: {{url}}",
  },
  "SALE IS LIVE! Visit {{url}} to grab your favorites at discounted prices.": {
    en: "SALE IS LIVE! Visit {{url}} to grab your favorites at discounted prices.",
    bn: "সেল চলছে! আপনার পছন্দের পণ্যগুলো ডিসকাউন্ট মূল্যে পেতে ভিজিট করুন: {{url}}",
  },
  "Celebrate this festival with us! Check out our special festival collection: {{url}}": {
    en: "Celebrate this festival with us! Check out our special festival collection: {{url}}",
    bn: "আমাদের সাথে উৎসব উদযাপন করুন! আমাদের বিশেষ উৎসব কালেকশন দেখুন: {{url}}",
  },
  "Sync": { en: "Sync", bn: "সিঙ্ক" },
  "Store Information": { en: "Store Information", bn: "স্টোর তথ্য" },
  "No description": { en: "No description", bn: "কোনো বিবরণ নেই" },
  "Address not set": { en: "Address not set", bn: "ঠিকানা সেট করা হয়নি" },
  "WhatsApp not set": { en: "WhatsApp not set", bn: "হোয়াটসঅ্যাপ সেট করা হয়নি" },
  "Category not set": { en: "Category not set", bn: "ক্যাটাগরি সেট করা হয়নি" },
  "Visible Online": { en: "Visible Online", bn: "অনলাইনে দৃশ্যমান" },
  "Conversion Rate": { en: "Conversion Rate", bn: "কনভার্সন রেট" },
  "Item Name": { en: "Item Name", bn: "আইটেমের নাম" },
  "ERP Price": { en: "ERP Price", bn: "ইআরপি মূল্য" },
  "Accept": { en: "Accept", bn: "গ্রহণ করুন" },
  "Complete": { en: "Complete", bn: "সম্পন্ন করুন" },
  "New": { en: "New", bn: "নতুন" },
  "Accepted": { en: "Accepted", bn: "গৃহীত" },
  "Completed": { en: "Completed", bn: "সম্পন্ন" },
  "Store not found": { en: "Store not found", bn: "স্টোর পাওয়া যায়নি" },
  "Loading products…": { en: "Loading products…", bn: "পণ্য লোড হচ্ছে…" },
  "No products available in the online store yet.": {
    en: "No products available in the online store yet.",
    bn: "অনলাইন স্টোরে এখনো কোনো পণ্য নেই।",
  },
  "Cart": { en: "Cart", bn: "কার্ট" },

  // ───── Final polish: Grow / Online Store ─────
  "Sell online with a free storefront. Catalogue your items, share the link with customers, accept orders and sync them back to ERPOVO automatically.":
    {
      en: "Sell online with a free storefront. Catalogue your items, share the link with customers, accept orders and sync them back to ERPOVO automatically.",
      bn: "ফ্রি স্টোরফ্রন্ট দিয়ে অনলাইনে বিক্রি করুন। আইটেম ক্যাটালগ করুন, গ্রাহকদের সাথে লিঙ্ক শেয়ার করুন, অর্ডার গ্রহণ করুন এবং স্বয়ংক্রিয়ভাবে ERPOVO-তে সিঙ্ক করুন।",
    },
  "Preview Store": { en: "Preview Store", bn: "স্টোর প্রিভিউ" },
  "Share Link": { en: "Share Link", bn: "লিঙ্ক শেয়ার করুন" },
  "Force Sync": { en: "Force Sync", bn: "ফোর্স সিঙ্ক" },
  "Get Your Own Website": { en: "Get Your Own Website", bn: "নিজের ওয়েবসাইট নিন" },
  "Online Orders": { en: "Online Orders", bn: "অনলাইন অর্ডার" },
  "Manage and convert orders from your storefront into sale invoices.": {
    en: "Manage and convert orders from your storefront into sale invoices.",
    bn: "আপনার স্টোরফ্রন্ট থেকে অর্ডার ম্যানেজ করুন এবং বিক্রয় ইনভয়েসে রূপান্তর করুন।",
  },
  "Manage Orders": { en: "Manage Orders", bn: "অর্ডার ম্যানেজ করুন" },
  "Store Views": { en: "Store Views", bn: "স্টোর ভিউ" },
  "Total Orders": { en: "Total Orders", bn: "মোট অর্ডার" },
  "Open Orders": { en: "Open Orders", bn: "ওপেন অর্ডার" },
  
  "Order Value": { en: "Order Value", bn: "অর্ডার মূল্য" },
  Catalogue: { en: "Catalogue", bn: "ক্যাটালগ" },

  // ───── Final polish: Access denied / system screens ─────
  "Access Denied": { en: "Access Denied", bn: "প্রবেশ নিষেধ" },
  "You don't have permission to view this page. Contact your administrator to request access.": {
    en: "You don't have permission to view this page. Contact your administrator to request access.",
    bn: "এই পেজ দেখার অনুমতি আপনার নেই। প্রবেশাধিকার পেতে অ্যাডমিনের সাথে যোগাযোগ করুন।",
  },
  "Admins only": { en: "Admins only", bn: "শুধুমাত্র অ্যাডমিন" },
  "Insufficient role": { en: "Insufficient role", bn: "অপর্যাপ্ত ভূমিকা" },
  "Missing permission": { en: "Missing permission", bn: "অনুপস্থিত অনুমতি" },
  "Back to Dashboard": { en: "Back to Dashboard", bn: "ড্যাশবোর্ডে ফিরে যান" },
  "Switch Company": { en: "Switch Company", bn: "কোম্পানি পরিবর্তন" },
  "is under maintenance": { en: "is under maintenance", bn: "রক্ষণাবেক্ষণ চলছে" },
  "We're performing scheduled maintenance. Please check back shortly.": {
    en: "We're performing scheduled maintenance. Please check back shortly.",
    bn: "আমরা নির্ধারিত রক্ষণাবেক্ষণ করছি। কিছুক্ষণ পর আবার চেষ্টা করুন।",
  },
  "Coming Soon": { en: "Coming Soon", bn: "শীঘ্রই আসছে" },
  "This section is part of a future Super Admin phase. Stay tuned.": {
    en: "This section is part of a future Super Admin phase. Stay tuned.",
    bn: "এই অংশটি ভবিষ্যৎ সুপার অ্যাডমিন ফেজের অংশ। সাথে থাকুন।",
  },
  "Upgrade required": { en: "Upgrade required", bn: "আপগ্রেড প্রয়োজন" },
  "Plan locked": { en: "Plan locked", bn: "প্ল্যান লক" },
  "Device limit exceeded": { en: "Device limit exceeded", bn: "ডিভাইস সীমা অতিক্রান্ত" },
  "Reset demo devices": { en: "Reset demo devices", bn: "ডেমো ডিভাইস রিসেট" },

  // ───── Online Store / Grow ─────
  "Store not configured yet": {
    en: "Store not configured yet",
    bn: "স্টোর এখনো কনফিগার করা হয়নি",
  },
  "Your Online Store": { en: "Your Online Store", bn: "আপনার অনলাইন স্টোর" },
  "Please configure your online store first": {
    en: "Please configure your online store first",
    bn: "অনুগ্রহ করে প্রথমে অনলাইন স্টোর কনফিগার করুন",
  },
  "Store link copied": { en: "Store link copied", bn: "স্টোর লিঙ্ক কপি হয়েছে" },
  "Store synced": { en: "Store synced", bn: "স্টোর সিঙ্ক হয়েছে" },
  "Custom website builder will be available in a future release.": {
    en: "Custom website builder will be available in a future release.",
    bn: "কাস্টম ওয়েবসাইট বিল্ডার ভবিষ্যতের একটি রিলিজে উপলব্ধ হবে।",
  },
  "No online orders yet": { en: "No online orders yet", bn: "এখনো কোনো অনলাইন অর্ডার নেই" },
  "Orders placed from your storefront will appear here. Share your store link to start receiving orders.":
    {
      en: "Orders placed from your storefront will appear here. Share your store link to start receiving orders.",
      bn: "আপনার স্টোরফ্রন্ট থেকে দেওয়া অর্ডারগুলো এখানে দেখা যাবে। অর্ডার পেতে স্টোর লিঙ্ক শেয়ার করুন।",
    },
  "Go to Store": { en: "Go to Store", bn: "স্টোরে যান" },
  "Order No": { en: "Order No", bn: "অর্ডার নং" },
  "Mark Delivered": { en: "Mark Delivered", bn: "ডেলিভার্ড চিহ্নিত করুন" },
  "Order updated": { en: "Order updated", bn: "অর্ডার আপডেট হয়েছে" },
  "Convert to Sale Invoice": { en: "Convert to Sale Invoice", bn: "সেল ইনভয়েসে কনভার্ট করুন" },
  "Already Converted": { en: "Already Converted", bn: "ইতিমধ্যে কনভার্ট হয়েছে" },
  "Open Invoice": { en: "Open Invoice", bn: "ইনভয়েস খুলুন" },
  "View Order": { en: "View Order", bn: "অর্ডার দেখুন" },
  "Cancel Order": { en: "Cancel Order", bn: "অর্ডার বাতিল করুন" },
  "Online Order": { en: "Online Order", bn: "অনলাইন অর্ডার" },
  "Converted to sale invoice": {
    en: "Converted to sale invoice",
    bn: "সেল ইনভয়েসে কনভার্ট হয়েছে",
  },
  "Open Online Order": { en: "Open Online Order", bn: "অনলাইন অর্ডার খুলুন" },
  "Source: Online Order": { en: "Source: Online Order", bn: "উৎস: অনলাইন অর্ডার" },
  "Sale Order": { en: "Sale Order", bn: "সেল অর্ডার" },
  "Sale Order Created": { en: "Sale Order Created", bn: "সেল অর্ডার তৈরি হয়েছে" },
  "Sale Order failed": { en: "Sale Order failed", bn: "সেল অর্ডার তৈরি ব্যর্থ" },
  "Open Sale Order": { en: "Open Sale Order", bn: "সেল অর্ডার খুলুন" },
  "Your cart is empty": { en: "Your cart is empty", bn: "আপনার কার্ট খালি" },
  "Add to Cart": { en: "Add to Cart", bn: "কার্টে যোগ করুন" },
  Checkout: { en: "Checkout", bn: "চেকআউট" },
  "Place Order": { en: "Place Order", bn: "অর্ডার করুন" },
  "Order placed successfully": {
    en: "Order placed successfully",
    bn: "অর্ডার সফলভাবে দেওয়া হয়েছে",
  },
  "Delivery Status": { en: "Delivery Status", bn: "ডেলিভারি স্ট্যাটাস" },
  "Delivery Note": { en: "Delivery Note", bn: "ডেলিভারি নোট" },
  "Tracking No": { en: "Tracking No", bn: "ট্র্যাকিং নং" },
  Courier: { en: "Courier", bn: "কুরিয়ার" },
  Processing: { en: "Processing", bn: "প্রসেসিং" },
  Converted: { en: "Converted", bn: "কনভার্ট হয়েছে" },
  "Mark Processing": { en: "Mark Processing", bn: "প্রসেসিং চিহ্নিত করুন" },
  "Mark Shipped": { en: "Mark Shipped", bn: "পাঠানো চিহ্নিত করুন" },
  "Converted only": { en: "Converted only", bn: "শুধু কনভার্ট হওয়া" },
  "Unconverted only": { en: "Unconverted only", bn: "শুধু অ-কনভার্ট" },
  "Search order no, customer, phone": {
    en: "Search order no, customer, phone",
    bn: "অর্ডার নং, কাস্টমার, ফোন সার্চ করুন",
  },
  "Confirm cancel this order?": {
    en: "Confirm cancel this order?",
    bn: "এই অর্ডার বাতিল নিশ্চিত করবেন?",
  },
  "Save Tracking": { en: "Save Tracking", bn: "ট্র্যাকিং সেভ করুন" },
  "Select All": { en: "Select All", bn: "সব সিলেক্ট করুন" },
  Selected: { en: "Selected", bn: "সিলেক্টেড" },
  "Bulk Actions": { en: "Bulk Actions", bn: "বাল্ক অ্যাকশন" },
  "Cancel Selected": { en: "Cancel Selected", bn: "সিলেক্টেড বাতিল করুন" },
  "Export Selected": { en: "Export Selected", bn: "সিলেক্টেড এক্সপোর্ট" },
  "Export Current Page": { en: "Export Current Page", bn: "বর্তমান পেজ এক্সপোর্ট" },
  "Export All Filtered": { en: "Export All Filtered", bn: "ফিল্টার করা সব এক্সপোর্ট" },
  "Confirm cancel selected orders?": {
    en: "Confirm cancel selected orders?",
    bn: "সিলেক্টেড অর্ডার বাতিল নিশ্চিত করবেন?",
  },
  "No eligible orders for this action.": {
    en: "No eligible orders for this action.",
    bn: "এই অ্যাকশনের জন্য কোনো উপযুক্ত অর্ডার নেই।",
  },
  "No data to export.": { en: "No data to export.", bn: "এক্সপোর্ট করার মতো ডেটা নেই।" },
  "Large export — this may take a moment.": {
    en: "Large export — this may take a moment.",
    bn: "বড় এক্সপোর্ট — একটু সময় লাগতে পারে।",
  },
  updated: { en: "updated", bn: "আপডেট হয়েছে" },
  skipped: { en: "skipped", bn: "স্কিপ হয়েছে" },
  Clear: { en: "Clear", bn: "ক্লিয়ার" },
  "Export limit exceeded": { en: "Export limit exceeded", bn: "এক্সপোর্ট সীমা অতিক্রম" },
  "Catalogue Manager": { en: "Catalogue Manager", bn: "ক্যাটালগ ম্যানেজার" },
  "Manage Catalogue": { en: "Manage Catalogue", bn: "ক্যাটালগ ম্যানেজ" },
  "Manage Items": { en: "Manage Items", bn: "আইটেম ম্যানেজ" },
  "Add to Store": { en: "Add to Store", bn: "স্টোরে যোগ করুন" },
  "Remove from Store": { en: "Remove from Store", bn: "স্টোর থেকে সরান" },
  "Show in Online Store": { en: "Show in Online Store", bn: "অনলাইন স্টোরে দেখান" },
  "Online Price": { en: "Online Price", bn: "অনলাইন মূল্য" },
  "Online Description": { en: "Online Description", bn: "অনলাইন বিবরণ" },
  Featured: { en: "Featured", bn: "ফিচার্ড" },
  "In Stock": { en: "In Stock", bn: "স্টকে আছে" },
  "Out of Stock": { en: "Out of Stock", bn: "স্টক নেই" },
  "Bulk Add": { en: "Bulk Add", bn: "বাল্ক যোগ করুন" },
  "Bulk Remove": { en: "Bulk Remove", bn: "বাল্ক সরান" },
  "Sync Catalogue": { en: "Sync Catalogue", bn: "ক্যাটালগ সিঙ্ক করুন" },
  "Contact for price": { en: "Contact for price", bn: "মূল্যের জন্য যোগাযোগ" },
  "No image": { en: "No image", bn: "ছবি নেই" },
  "Product image": { en: "Product image", bn: "পণ্যের ছবি" },
  "Image unavailable": { en: "Image unavailable", bn: "ছবি পাওয়া যায়নি" },
  "New Customer": { en: "New Customer", bn: "নতুন কাস্টমার" },
  "Add New Customer": { en: "Add New Customer", bn: "নতুন কাস্টমার যোগ করুন" },
  "Customer name is required": { en: "Customer name is required", bn: "কাস্টমারের নাম প্রয়োজন" },
  "Customer Name": { en: "Customer Name", bn: "কাস্টমারের নাম" },
  "Customer already exists": { en: "Customer already exists", bn: "কাস্টমার আগে থেকেই আছে" },
  "Customer added": { en: "Customer added", bn: "কাস্টমার যোগ হয়েছে" },
  "You do not have permission to add customers": {
    en: "You do not have permission to add customers",
    bn: "আপনার কাস্টমার যোগ করার অনুমতি নেই",
  },
  "Walk-in Customer": { en: "Walk-in Customer", bn: "ওয়াক-ইন কাস্টমার" },
  "Select customer": { en: "Select customer", bn: "কাস্টমার নির্বাচন করুন" },
  "No customers. Add one in Parties.": {
    en: "No customers. Add one in Parties.",
    bn: "কোনো কাস্টমার নেই। পার্টিজ থেকে যোগ করুন।",
  },
  "Select item": { en: "Select item", bn: "আইটেম নির্বাচন করুন" },
  "No items. Add some in Items.": {
    en: "No items. Add some in Items.",
    bn: "কোনো আইটেম নেই। আইটেম থেকে যোগ করুন।",
  },
  "Image URL": { en: "Image URL", bn: "ছবির URL" },
  "Search by name, SKU or barcode": {
    en: "Search by name, SKU or barcode",
    bn: "নাম, SKU বা বারকোড দিয়ে খুঁজুন",
  },
  "No items found": { en: "No items found", bn: "কোনো আইটেম পাওয়া যায়নি" },
  "Duplicate customer found": {
    en: "Duplicate customer found",
    bn: "একই কাস্টমার পাওয়া গেছে",
  },
  "No items in catalogue yet.": {
    en: "No items in catalogue yet.",
    bn: "ক্যাটালগে এখনও কোনো আইটেম নেই।",
  },
  "Item Details": { en: "Item Details", bn: "আইটেমের বিবরণ" },
  "Store Management": { en: "Store Management", bn: "স্টোর ম্যানেজমেন্ট" },
  "Manage Stores": { en: "Manage Stores", bn: "স্টোর ম্যানেজ করুন" },
  "Add Store": { en: "Add Store", bn: "স্টোর যোগ করুন" },
  "Transfer Stock": { en: "Transfer Stock", bn: "স্টক ট্রান্সফার" },
  "Main Store": { en: "Main Store", bn: "মেইন স্টোর" },
  "Store Name": { en: "Store Name", bn: "স্টোরের নাম" },
  "Store Type": { en: "Store Type", bn: "স্টোরের ধরন" },
  "Contact Details": { en: "Contact Details", bn: "যোগাযোগের তথ্য" },
  Location: { en: "Location", bn: "লোকেশন" },
  "Wholesale Store": { en: "Wholesale Store", bn: "হোলসেল স্টোর" },
  "Retail Store": { en: "Retail Store", bn: "রিটেইল স্টোর" },
  Warehouse: { en: "Warehouse", bn: "ওয়্যারহাউস" },
  Branch: { en: "Branch", bn: "ব্রাঞ্চ" },
  "View Stock": { en: "View Stock", bn: "স্টক দেখুন" },
  "Edit Store": { en: "Edit Store", bn: "স্টোর এডিট করুন" },
  "Store-wise Stock": { en: "Store-wise Stock", bn: "স্টোরভিত্তিক স্টক" },
  "Active Store": { en: "Active Store", bn: "সক্রিয় স্টোর" },
  "Inactive Store": { en: "Inactive Store", bn: "নিষ্ক্রিয় স্টোর" },
  "Main Store Only": { en: "Main Store Only", bn: "শুধু মেইন স্টোর" },
  "Low Stock": { en: "Low Stock", bn: "কম স্টক" },
  "Current Stock": { en: "Current Stock", bn: "বর্তমান স্টক" },
  "Transfer This Item": { en: "Transfer This Item", bn: "এই পণ্য ট্রান্সফার করুন" },
  "Bulk Transfer": { en: "Bulk Transfer", bn: "বাল্ক ট্রান্সফার" },
  "Export Stock": { en: "Export Stock", bn: "স্টক এক্সপোর্ট" },
  "Selected Items": { en: "Selected Items", bn: "সিলেক্টেড পণ্য" },
  "Transfer Quantity": { en: "Transfer Quantity", bn: "ট্রান্সফার পরিমাণ" },
  "Available Stock": { en: "Available Stock", bn: "উপলব্ধ স্টক" },
  // Super Admin polish
  "All tenant companies.": { en: "All tenant companies.", bn: "সব টেন্যান্ট কোম্পানি।" },
  "Search by company or owner…": {
    en: "Search by company or owner…",
    bn: "কোম্পানি বা মালিক দিয়ে খুঁজুন…",
  },
  "No companies.": { en: "No companies.", bn: "কোনো কোম্পানি নেই।" },
  Manage: { en: "Manage", bn: "ব্যবস্থাপনা" },
  "All owner-level subscriptions.": {
    en: "All owner-level subscriptions.",
    bn: "সব মালিক-পর্যায়ের সাবস্ক্রিপশন।",
  },
  "No subscriptions.": { en: "No subscriptions.", bn: "কোনো সাবস্ক্রিপশন নেই।" },
  Started: { en: "Started", bn: "শুরু" },
  "Plan feature matrix + per-company overrides.": {
    en: "Plan feature matrix + per-company overrides.",
    bn: "প্ল্যান ফিচার ম্যাট্রিক্স + কোম্পানি-ভিত্তিক ওভাররাইড।",
  },
  "Plan Matrix": { en: "Plan Matrix", bn: "প্ল্যান ম্যাট্রিক্স" },
  "Company Overrides": { en: "Company Overrides", bn: "কোম্পানি ওভাররাইড" },
  Feature: { en: "Feature", bn: "ফিচার" },
  "Plan feature updated": { en: "Plan feature updated", bn: "প্ল্যান ফিচার আপডেট হয়েছে" },
  "Add / Update Override": { en: "Add / Update Override", bn: "ওভাররাইড যোগ / আপডেট" },
  "Active Overrides": { en: "Active Overrides", bn: "সক্রিয় ওভাররাইড" },
  "Company ID (uuid)": { en: "Company ID (uuid)", bn: "কোম্পানি আইডি (uuid)" },
  Beta: { en: "Beta", bn: "বেটা" },
  "Save override": { en: "Save override", bn: "ওভাররাইড সংরক্ষণ" },
  "Override saved": { en: "Override saved", bn: "ওভাররাইড সংরক্ষিত" },
  "Override removed": { en: "Override removed", bn: "ওভাররাইড সরানো হয়েছে" },
  "No overrides set.": { en: "No overrides set.", bn: "কোনো ওভাররাইড সেট নেই।" },
  "Manage who can access the Super Admin panel.": {
    en: "Manage who can access the Super Admin panel.",
    bn: "Super Admin প্যানেলে কাদের অ্যাক্সেস থাকবে তা নির্ধারণ করুন।",
  },
  "Super Admin Manager": { en: "Super Admin Manager", bn: "Super Admin ব্যবস্থাপক" },
  "Grant or revoke platform-wide super admin access. The last remaining admin cannot be removed.": {
    en: "Grant or revoke platform-wide super admin access. The last remaining admin cannot be removed.",
    bn: "প্ল্যাটফর্ম-ব্যাপী super admin অ্যাক্সেস দিন বা বাতিল করুন। শেষ admin সরানো যাবে না।",
  },
  "Add by email": { en: "Add by email", bn: "ইমেইল দিয়ে যোগ করুন" },
  "Grant access": { en: "Grant access", bn: "অ্যাক্সেস দিন" },
  "User ID": { en: "User ID", bn: "ইউজার আইডি" },
  Since: { en: "Since", bn: "থেকে" },
  "No platform admins yet.": { en: "No platform admins yet.", bn: "এখনো কোনো platform admin নেই।" },
  "Platform admin added": { en: "Platform admin added", bn: "Platform admin যোগ হয়েছে" },
  "Platform admin removed": { en: "Platform admin removed", bn: "Platform admin সরানো হয়েছে" },
  "Failed to add admin": { en: "Failed to add admin", bn: "admin যোগ করতে ব্যর্থ" },
  "Failed to remove admin": { en: "Failed to remove admin", bn: "admin সরাতে ব্যর্থ" },
  "Remove this platform admin?": {
    en: "Remove this platform admin?",
    bn: "এই platform admin সরাবেন?",
  },
  "Remove YOUR OWN super admin access? You will be locked out of /super-admin.": {
    en: "Remove YOUR OWN super admin access? You will be locked out of /super-admin.",
    bn: "নিজের super admin অ্যাক্সেস সরাবেন? আপনি /super-admin থেকে লক হয়ে যাবেন।",
  },
  "(you)": { en: "(you)", bn: "(আপনি)" },

  // ───── Sale Invoice post-save actions ─────
  "Invoice Saved": { en: "Invoice Saved", bn: "ইনভয়েস সেভ হয়েছে" },

  // ───── Sale Invoice status timeline ─────
  "Status Timeline": { en: "Status Timeline", bn: "স্ট্যাটাস টাইমলাইন" },
  "Invoice Created": { en: "Invoice Created", bn: "ইনভয়েস তৈরি হয়েছে" },
  "Invoice Updated": { en: "Invoice Updated", bn: "ইনভয়েস আপডেট হয়েছে" },
  "Payment Received": { en: "Payment Received", bn: "পেমেন্ট গ্রহণ করা হয়েছে" },
  "PDF Downloaded": { en: "PDF Downloaded", bn: "PDF ডাউনলোড হয়েছে" },
  "No history yet": { en: "No history yet", bn: "এখনো কোনো হিস্টোরি নেই" },
  "Print Invoice": { en: "Print Invoice", bn: "ইনভয়েস প্রিন্ট" },
  "Download PDF": { en: "Download PDF", bn: "PDF ডাউনলোড" },
  "Create Another Sale": { en: "Create Another Sale", bn: "আরেকটি বিক্রয় তৈরি করুন" },
  "PDF generation failed": { en: "PDF generation failed", bn: "PDF তৈরি করা যায়নি" },
  "Could not generate the PDF. You can retry without re-saving the invoice.": {
    en: "Could not generate the PDF. You can retry without re-saving the invoice.",
    bn: "PDF তৈরি করা যায়নি। ইনভয়েস আবার সেভ না করেই আপনি পুনরায় চেষ্টা করতে পারেন।",
  },
  "Invoice saved, but invoice reference was not found.": {
    en: "Invoice saved, but invoice reference was not found.",
    bn: "ইনভয়েস সেভ হয়েছে, কিন্তু ইনভয়েস রেফারেন্স পাওয়া যায়নি।",
  },
  // ───── Attachments (Phase 2) ─────
  Attachments: { en: "Attachments", bn: "সংযুক্তি" },
  "Attach Images": { en: "Attach Images", bn: "ছবি সংযুক্ত করুন" },
  "Attach Documents": { en: "Attach Documents", bn: "ডকুমেন্ট সংযুক্ত করুন" },
  "Upload Image": { en: "Upload Image", bn: "ছবি আপলোড" },
  "Upload Document": { en: "Upload Document", bn: "ডকুমেন্ট আপলোড" },
  "Download Attachment": { en: "Download Attachment", bn: "সংযুক্ত ফাইল ডাউনলোড" },
  "Remove Attachment": { en: "Remove Attachment", bn: "সংযুক্ত ফাইল মুছুন" },
  "File too large": { en: "File too large", bn: "ফাইল খুব বড়" },
  "Unsupported file type": { en: "Unsupported file type", bn: "এই ফাইল টাইপ সাপোর্টেড নয়" },
  "Attachment uploaded": { en: "Attachment uploaded", bn: "সংযুক্তি আপলোড হয়েছে" },
  "Attachment removed": { en: "Attachment removed", bn: "সংযুক্তি মুছে ফেলা হয়েছে" },
  "Attachment limit reached": { en: "Attachment limit reached", bn: "সংযুক্তির সীমা শেষ" },
  "No attachments yet": { en: "No attachments yet", bn: "এখনো কোনো সংযুক্তি নেই" },
  "Pending upload": { en: "Pending upload", bn: "আপলোডের অপেক্ষায়" },
  "Files will be uploaded after you save.": {
    en: "Files will be uploaded after you save.",
    bn: "সেভ করার পরে ফাইল আপলোড হবে।",
  },
  "Could not open attachment": { en: "Could not open attachment", bn: "সংযুক্তি খোলা যায়নি" },
  "Download failed": { en: "Download failed", bn: "ডাউনলোড ব্যর্থ হয়েছে" },
  Uploading: { en: "Uploading", bn: "আপলোড হচ্ছে" },
  Uploaded: { en: "Uploaded", bn: "আপলোড হয়েছে" },
  Failed: { en: "Failed", bn: "ব্যর্থ" },
  Retry: { en: "Retry", bn: "আবার চেষ্টা করুন" },
  "Remove from queue": { en: "Remove from queue", bn: "কিউ থেকে সরান" },
  "Upload failed": { en: "Upload failed", bn: "আপলোড ব্যর্থ হয়েছে" },
  // Status key already defined above
  "Attachment upload failed": {
    en: "Attachment upload failed",
    bn: "সংযুক্তি আপলোড ব্যর্থ হয়েছে",
  },
  "Import Progress": { en: "Import Progress", bn: "ইমপোর্ট প্রগ্রেস" },
  "Import History": { en: "Import History", bn: "ইমপোর্ট হিস্টোরি" },
  "Parsing File": { en: "Parsing File", bn: "ফাইল পড়া হচ্ছে" },
  "Images Imported": { en: "Images Imported", bn: "ছবি ইমপোর্ট হয়েছে" },
  "Skipped Rows": { en: "Skipped Rows", bn: "বাদ দেওয়া সারি" },
  "Download Report": { en: "Download Report", bn: "রিপোর্ট ডাউনলোড" },
  "Import Batch": { en: "Import Batch", bn: "ইমপোর্ট ব্যাচ" },
  "Import Completed": { en: "Import Completed", bn: "ইমপোর্ট সম্পন্ন হয়েছে" },
  "Import Failed": { en: "Import Failed", bn: "ইমপোর্ট ব্যর্থ হয়েছে" },
  Images: { en: "Images", bn: "ছবি" },
  "Cancel Import": { en: "Cancel Import", bn: "ইমপোর্ট বাতিল করুন" },
  "Retry Import": { en: "Retry Import", bn: "আবার ইমপোর্ট করুন" },
  "Import Cancelled": { en: "Import Cancelled", bn: "ইমপোর্ট বাতিল হয়েছে" },
  "Module Started": { en: "Module Started", bn: "মডিউল শুরু হয়েছে" },
  "Module Completed": { en: "Module Completed", bn: "মডিউল সম্পন্ন হয়েছে" },
  "Export Report CSV": { en: "Export Report CSV", bn: "CSV রিপোর্ট এক্সপোর্ট" },
  "Export Report JSON": { en: "Export Report JSON", bn: "JSON রিপোর্ট এক্সপোর্ট" },
  "Please re-upload the original backup file": {
    en: "Please re-upload the original backup file",
    bn: "অনুগ্রহ করে মূল ব্যাকআপ ফাইলটি আবার আপলোড করুন",
  },
  "File type": { en: "File type", bn: "ফাইল টাইপ" },
  "Search file or batch id": {
    en: "Search file or batch id",
    bn: "ফাইল বা ব্যাচ আইডি খুঁজুন",
  },
  "Sync to Cloud": { en: "Sync to Cloud", bn: "ক্লাউডে সিঙ্ক" },
  "Transaction History": { en: "Transaction History", bn: "ট্রানজেকশন হিস্টোরি" },
  "Backup to PC": { en: "Backup to PC", bn: "কম্পিউটারে ব্যাকআপ" },
  "Backup to Drive": { en: "Backup to Drive", bn: "ড্রাইভে ব্যাকআপ" },

  "Add User": { en: "Add User", bn: "ইউজার যোগ করুন" },
  "Edit Role": { en: "Edit Role", bn: "রোল এডিট করুন" },
  "Logout Device": { en: "Logout Device", bn: "ডিভাইস লগআউট" },
  "Backup Downloaded": { en: "Backup Downloaded", bn: "ব্যাকআপ ডাউনলোড হয়েছে" },
  "Backup Failed": { en: "Backup Failed", bn: "ব্যাকআপ ব্যর্থ হয়েছে" },
  "Drive integration not configured": {
    en: "Drive integration not configured — downloading to PC instead",
    bn: "ড্রাইভ ইন্টিগ্রেশন কনফিগার নেই — পিসিতে ডাউনলোড হচ্ছে",
  },
  "Only owners and admins can perform this action": {
    en: "Only owners and admins can perform this action",
    bn: "শুধুমাত্র মালিক/অ্যাডমিন এই কাজ করতে পারবেন",
  },
  "Transaction history is required and cannot be disabled": {
    en: "Transaction history is required and cannot be disabled",
    bn: "ট্রানজেকশন হিস্টোরি বন্ধ করা যাবে না",
  },
  "Connected Devices": { en: "Connected Devices", bn: "কানেক্টেড ডিভাইস" },
  "Users & Roles": { en: "Users & Roles", bn: "ইউজার ও রোল" },

  // ───── Topbar overflow menu (Notifications, Reminder, Privacy, Settings) ─────
  Notifications: { en: "Notifications", bn: "নোটিফিকেশন" },
  "Payment Reminder": { en: "Payment Reminder", bn: "পেমেন্ট রিমাইন্ডার" },
  Privacy: { en: "Privacy", bn: "প্রাইভেসি" },
  "Privacy on": { en: "Privacy on", bn: "প্রাইভেসি চালু" },
  "Privacy off": { en: "Privacy off", bn: "প্রাইভেসি বন্ধ" },
  "Privacy Mode Active": { en: "Privacy Mode Active", bn: "প্রাইভেসি মোড চালু" },
  "More options": { en: "More options", bn: "আরও অপশন" },
  More: { en: "More", bn: "আরও" },
  "Mark read": { en: "Mark read", bn: "পড়া হিসেবে চিহ্নিত করুন" },
  "Mark unread": { en: "Mark unread", bn: "অপঠিত হিসেবে চিহ্নিত করুন" },
  "Mark all read": { en: "Mark all read", bn: "সব পড়া হয়েছে" },
  "Clear all": { en: "Clear all", bn: "সব মুছুন" },
  "No notifications yet": { en: "No notifications yet", bn: "এখনো কোনো নোটিফিকেশন নেই" },
  "just now": { en: "just now", bn: "এইমাত্র" },
  "m ago": { en: "m ago", bn: " মি আগে" },
  "h ago": { en: "h ago", bn: " ঘ আগে" },
  "d ago": { en: "d ago", bn: " দিন আগে" },
  Overdue: { en: "Overdue", bn: "মেয়াদোত্তীর্ণ" },
  "Due today": { en: "Due today", bn: "আজ দেয়" },
  Upcoming: { en: "Upcoming", bn: "আসন্ন" },
  "No due date": { en: "No due date", bn: "কোনো নির্ধারিত তারিখ নেই" },
  "Nothing here": { en: "Nothing here", bn: "কিছু পাওয়া যায়নি" },
  "Search party, reference or phone": {
    en: "Search party, reference or phone",
    bn: "পার্টি, রেফারেন্স বা ফোন খুঁজুন",
  },
  "Mark contacted": { en: "Mark contacted", bn: "যোগাযোগ হয়েছে চিহ্নিত" },
  "Marked as contacted": { en: "Marked as contacted", bn: "যোগাযোগ হয়েছে চিহ্নিত হয়েছে" },
  "Reminder logged": { en: "Reminder logged", bn: "রিমাইন্ডার লগ করা হয়েছে" },
  Call: { en: "Call", bn: "কল করুন" },
  Open: { en: "Open", bn: "খুলুন" },
  "Print failed": { en: "Print failed", bn: "প্রিন্ট ব্যর্থ হয়েছে" },
  "Search Transactions": { en: "Search Transactions", bn: "ট্রানজেকশন খুঁজুন" },
  Firm: { en: "Firm", bn: "প্রতিষ্ঠান" },
  "All Firms": { en: "All Firms", bn: "সব প্রতিষ্ঠান" },
  "Current Firm": { en: "Current Firm", bn: "বর্তমান প্রতিষ্ঠান" },
  "Transaction Type": { en: "Transaction Type", bn: "ট্রানজেকশন টাইপ" },
  "All Transactions": { en: "All Transactions", bn: "সব ট্রানজেকশন" },
  "Credit Note": { en: "Credit Note", bn: "ক্রেডিট নোট" },
  "Debit Note": { en: "Debit Note", bn: "ডেবিট নোট" },
  "All Parties": { en: "All Parties", bn: "সব পার্টি" },
  "Ref No": { en: "Ref No", bn: "রেফারেন্স নং" },
  "Received/Paid": { en: "Received/Paid", bn: "গ্রহণ/পরিশোধ" },
  "No transactions to show": {
    en: "No transactions to show",
    bn: "দেখানোর মতো কোনো ট্রানজেকশন নেই",
  },
  "Print Transactions": { en: "Print Transactions", bn: "ট্রানজেকশন প্রিন্ট" },
  "Select a company": { en: "Select a company", bn: "একটি প্রতিষ্ঠান নির্বাচন করুন" },
  Transactions: { en: "Transactions", bn: "ট্রানজেকশন" },
};

/* ───── Status / enum translations ───── */

const STATUS_LABELS: Record<string, { en: string; bn: string }> = {
  // payment + subscription
  pending: { en: "Pending", bn: "অপেক্ষমান" },
  under_review: { en: "Under Review", bn: "পর্যালোচনাধীন" },
  approved: { en: "Approved", bn: "অনুমোদিত" },
  rejected: { en: "Rejected", bn: "প্রত্যাখ্যাত" },
  cancelled: { en: "Cancelled", bn: "বাতিল" },
  active: { en: "Active", bn: "সক্রিয়" },
  trial: { en: "Trial", bn: "ট্রায়াল" },
  expired: { en: "Expired", bn: "মেয়াদোত্তীর্ণ" },
  // invoice
  paid: { en: "Paid", bn: "পরিশোধিত" },
  partial: { en: "Partial", bn: "আংশিক" },
  unpaid: { en: "Unpaid", bn: "অপরিশোধিত" },
  overdue: { en: "Overdue", bn: "বকেয়া" },
  // generic
  draft: { en: "Draft", bn: "ড্রাফট" },
  posted: { en: "Posted", bn: "পোস্টেড" },
  reversed: { en: "Reversed", bn: "বিপরীত" },
};

const PLAN_LABELS: Record<string, { en: string; bn: string }> = {
  basic: { en: "Basic", bn: "বেসিক" },
  silver: { en: "Silver", bn: "সিলভার" },
  gold: { en: "Gold", bn: "গোল্ড" },
  pro: { en: "Pro", bn: "প্রো" },
  enterprise: { en: "Enterprise", bn: "এন্টারপ্রাইজ" },
};

const AUDIT_ACTION_LABELS: Record<string, { en: string; bn: string }> = {
  created: { en: "Created", bn: "তৈরি" },
  updated: { en: "Updated", bn: "আপডেট" },
  deleted: { en: "Deleted", bn: "ডিলিট" },
  restored: { en: "Restored", bn: "পুনরুদ্ধার" },
  edit_opened: { en: "Edit Opened", bn: "এডিট খোলা হয়েছে" },
  pdf_downloaded: { en: "PDF Downloaded", bn: "PDF ডাউনলোড" },
  previewed: { en: "Previewed", bn: "প্রিভিউ" },
  printed: { en: "Printed", bn: "প্রিন্ট" },
  duplicated: { en: "Duplicated", bn: "ডুপ্লিকেট" },
  approved: { en: "Approved", bn: "অনুমোদিত" },
  rejected: { en: "Rejected", bn: "প্রত্যাখ্যাত" },
  cancelled: { en: "Cancelled", bn: "বাতিল" },
};

// Late-added entries — kept here so they are merged into the main DICTIONARY
// without disturbing the layout above. Includes Import / Export and Support
// Chat (multilingual AI help) keys.
Object.assign(DICTIONARY, {
  // ───── Import / Export ─────
  "Import / Export": { en: "Import / Export", bn: "ইম্পোর্ট / এক্সপোর্ট" },
  "Import from Vyapar": { en: "Import from Vyapar", bn: "Vyapar থেকে আনুন" },
  "Supported: .vyb, .zip (with .vyp), or .vyp SQLite database.": {
    en: "Supported: .vyb, .zip (with .vyp), or .vyp SQLite database.",
    bn: "সাপোর্টেড: .vyb, .zip (.vyp সহ), বা .vyp SQLite ডেটাবেস।",
  },
  "Choose Vyapar backup": { en: "Choose Vyapar backup", bn: "Vyapar ব্যাকআপ বেছে নিন" },
  "Unsupported file. Use .vyb, .zip, or .vyp": {
    en: "Unsupported file. Use .vyb, .zip, or .vyp",
    bn: "ফাইল সাপোর্টেড নয়। .vyb, .zip বা .vyp ব্যবহার করুন",
  },
  "Vyapar backup loaded": { en: "Vyapar backup loaded", bn: "Vyapar ব্যাকআপ লোড হয়েছে" },
  "Tables detected": { en: "Tables detected", bn: "পাওয়া টেবিল" },
  "Import selected": { en: "Import selected", bn: "নির্বাচিত ইম্পোর্ট" },
  Imported: { en: "Imported", bn: "ইম্পোর্ট হয়েছে" },
  inserted: { en: "inserted", bn: "যোগ" },
  "ERPOVO Backup": { en: "ERPOVO Backup", bn: "ERPOVO ব্যাকআপ" },
  "Export ERPOVO backup": { en: "Export ERPOVO backup", bn: "ERPOVO ব্যাকআপ এক্সপোর্ট" },
  "Import ERPOVO backup": { en: "Import ERPOVO backup", bn: "ERPOVO ব্যাকআপ ইম্পোর্ট" },
  "Backup exported": { en: "Backup exported", bn: "ব্যাকআপ এক্সপোর্ট হয়েছে" },
  "ERPOVO backup loaded": { en: "ERPOVO backup loaded", bn: "ERPOVO ব্যাকআপ লোড হয়েছে" },
  "Exported at": { en: "Exported at", bn: "এক্সপোর্ট সময়" },
  "Vyapar-compatible CSV export": {
    en: "Vyapar-compatible CSV export",
    bn: "Vyapar-সামঞ্জস্যপূর্ণ CSV এক্সপোর্ট",
  },
  "CSV files for re-import or migration. Not a direct Vyapar restore.": {
    en: "CSV files for re-import or migration. Not a direct Vyapar restore.",
    bn: "পুনরায় ইম্পোর্ট বা মাইগ্রেশনের জন্য CSV ফাইল। সরাসরি Vyapar রিস্টোর নয়।",
  },
  "Only company owner or admin can use Import / Export.": {
    en: "Only company owner or admin can use Import / Export.",
    bn: "শুধুমাত্র মালিক বা অ্যাডমিন Import / Export ব্যবহার করতে পারবেন।",
  },
  "Back to Utilities": { en: "Back to Utilities", bn: "ইউটিলিটিতে ফিরুন" },
  Stores: { en: "Stores", bn: "স্টোর" },
  Categories: { en: "Categories", bn: "ক্যাটাগরি" },
  Units: { en: "Units", bn: "ইউনিট" },

  // ───── Support Chat (multilingual AI Help) ─────
  "Support Chat": { en: "Support Chat", bn: "সাপোর্ট চ্যাট" },
  "AI Support Assistant": { en: "AI Support Assistant", bn: "AI সাপোর্ট অ্যাসিস্ট্যান্ট" },
  "Ask anything about ERPOVO": {
    en: "Ask anything about ERPOVO",
    bn: "ERPOVO সম্পর্কে যেকোনো কিছু জিজ্ঞেস করুন",
  },
  "How can I help?": { en: "How can I help?", bn: "কীভাবে সাহায্য করতে পারি?" },
  "Suggested Questions": { en: "Suggested Questions", bn: "সাজেস্টেড প্রশ্ন" },
  "Clear Chat": { en: "Clear Chat", bn: "চ্যাট মুছুন" },
  "Built-in Help Mode": { en: "Built-in Help Mode", bn: "বিল্ট-ইন হেল্প মোড" },
  "AI API not configured": { en: "AI API not configured", bn: "AI API সেটআপ করা নেই" },
  "I can guide you step by step, but I cannot make changes directly": {
    en: "I can guide you step by step, but I cannot make changes directly",
    bn: "আমি আপনাকে ধাপে ধাপে গাইড করতে পারি, কিন্তু সরাসরি কোনো পরিবর্তন করতে পারি না",
  },
  "Open Sale Invoice": { en: "Open Sale Invoice", bn: "সেল ইনভয়েস খুলুন" },
  "Open Purchase Bill": { en: "Open Purchase Bill", bn: "পারচেজ বিল খুলুন" },
  "Open POS": { en: "Open POS", bn: "POS খুলুন" },
  "Open Settings": { en: "Open Settings", bn: "সেটিংস খুলুন" },
  "Open Items": { en: "Open Items", bn: "আইটেম খুলুন" },
  "Open Customers": { en: "Open Customers", bn: "কাস্টমার খুলুন" },
  "Open Import/Export": { en: "Open Import/Export", bn: "ইম্পোর্ট/এক্সপোর্ট খুলুন" },
  "Open Store Management": { en: "Open Store Management", bn: "স্টোর ম্যানেজমেন্ট খুলুন" },
  "Open Online Orders": { en: "Open Online Orders", bn: "অনলাইন অর্ডার খুলুন" },
  "Open Transaction Print": { en: "Open Transaction Print", bn: "ট্রানজেকশন প্রিন্ট খুলুন" },
  "Open Sync/Backup": { en: "Open Sync/Backup", bn: "সিঙ্ক/ব্যাকআপ খুলুন" },
  "Open Audit Log": { en: "Open Audit Log", bn: "অডিট লগ খুলুন" },
  "You are on": { en: "You are on", bn: "আপনি এখন আছেন" },
  "Explain this page": { en: "Explain this page", bn: "এই পেজটি ব্যাখ্যা করুন" },
  "Current page help": { en: "Current page help", bn: "বর্তমান পেজের সাহায্য" },
  "Page context": { en: "Page context", bn: "পেজ কনটেক্সট" },
  "Quick help for this page": { en: "Quick help for this page", bn: "এই পেজের দ্রুত সাহায্য" },
  "General help": { en: "General help", bn: "সাধারণ সাহায্য" },
  "Ask this": { en: "Ask this", bn: "এটি জিজ্ঞেস করুন" },
});

const missingKeysReported = new Set<string>();

const isDev =
  typeof import.meta !== "undefined" &&
  (import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } }).env?.DEV === true;

/** Translate any key. Falls back to the key string (so untranslated UI stays readable). */
export function translate(key: string, lang: Lang): string {
  const entry = DICTIONARY[key];
  if (entry) return entry[lang] ?? entry.en ?? key;
  if (lang === "bn" && isDev && !missingKeysReported.has(key)) {
    missingKeysReported.add(key);

    console.warn(`[i18n] missing Bangla translation for key: "${key}"`);
  }
  return key;
}

export function translateStatus(value: string | null | undefined, lang: Lang): string {
  if (!value) return "";
  const key = value.toLowerCase();
  const entry = STATUS_LABELS[key];
  if (entry) return entry[lang] ?? entry.en;
  return value;
}

export function translatePlan(value: string | null | undefined, lang: Lang): string {
  if (!value) return "";
  const entry = PLAN_LABELS[value.toLowerCase()];
  if (entry) return entry[lang] ?? entry.en;
  // Plan codes/keys are technical — return as-is.
  return value;
}

export function translateAuditAction(action: string, lang: Lang): string {
  const entry = AUDIT_ACTION_LABELS[action];
  if (entry) return entry[lang] ?? entry.en;
  // Humanize unknown actions (e.g. "salary_slip.printed" → "salary slip printed")
  return action.replace(/[._]/g, " ");
}

/* ───── Context ───── */

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  tStatus: (value: string | null | undefined) => string;
  tPlan: (value: string | null | undefined) => string;
  tAuditAction: (action: string) => string;
}

const Ctx = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
  tStatus: (v) => v ?? "",
  tPlan: (v) => v ?? "",
  tAuditAction: (a) => a,
});

function readInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "en" || v === "bn") return v;
  } catch {}
  return "en";
}

async function persistLangToCompanySettings(lang: Lang): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    // Best-effort: update the current owner's company settings.language.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from("companies")
      .select("id,settings")
      .eq("owner_id", uid)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!company?.id) return;
    const nextSettings = { ...(company.settings || {}), language: lang };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("companies")
      .update({ settings: nextSettings })
      .eq("id", company.id);
  } catch {
    // ignore — localStorage is the source of truth for UI
  }
}

async function hydrateLangFromCompanySettings(setLang: (l: Lang) => void): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from("companies")
      .select("settings")
      .eq("owner_id", uid)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const remote = company?.settings?.language;
    if (remote === "en" || remote === "bn") {
      try {
        window.localStorage.setItem(LS_KEY, remote);
      } catch {}
      setLang(remote);
    }
  } catch {
    // ignore
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  // One-shot hydrate from company settings (overrides localStorage if remote set)
  useEffect(() => {
    void hydrateLangFromCompanySettings(setLangState);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LS_KEY, l);
    } catch {}
    void persistLangToCompanySettings(l);
  }, []);

  const t = useCallback((key: string) => translate(key, lang), [lang]);
  const tStatus = useCallback((v: string | null | undefined) => translateStatus(v, lang), [lang]);
  const tPlan = useCallback((v: string | null | undefined) => translatePlan(v, lang), [lang]);
  const tAuditAction = useCallback((a: string) => translateAuditAction(a, lang), [lang]);

  return (
    <Ctx.Provider value={{ lang, setLang, t, tStatus, tPlan, tAuditAction }}>
      {children}
    </Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);

/** Return all DICTIONARY keys missing a Bangla string (or whose Bangla equals English). */
export function findMissingBanglaKeys(): string[] {
  return Object.entries(DICTIONARY)
    .filter(([, v]) => !v.bn || v.bn === v.en)
    .map(([k]) => k);
}

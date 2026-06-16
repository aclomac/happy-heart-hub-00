export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "platform_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          company_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          note: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date?: string
          employee_id: string
          id?: string
          note?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          note?: string | null
          status?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          amount_impact: number | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          module: string | null
          new_value: Json | null
          old_value: Json | null
          reference_no: string | null
          status: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          amount_impact?: number | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reference_no?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          amount_impact?: number | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reference_no?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string
          branch: string | null
          company_id: string
          created_at: string
          current_balance: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          ifsc: string | null
          is_active: boolean
          name: string
          note: string | null
          opening_balance: number
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          provider: string | null
          restored_at: string | null
          restored_by: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string
          branch?: string | null
          company_id: string
          created_at?: string
          current_balance?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          ifsc?: string | null
          is_active?: boolean
          name: string
          note?: string | null
          opening_balance?: number
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          provider?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string
          branch?: string | null
          company_id?: string
          created_at?: string
          current_balance?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          ifsc?: string | null
          is_active?: boolean
          name?: string
          note?: string | null
          opening_balance?: number
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          provider?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_transfers: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          from_bank_id: string | null
          from_kind: string
          id: string
          notes: string | null
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string
          posted_by: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          to_bank_id: string | null
          to_kind: string
          transfer_date: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_bank_id?: string | null
          from_kind: string
          id?: string
          notes?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          to_bank_id?: string | null
          to_kind: string
          transfer_date?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_bank_id?: string | null
          from_kind?: string
          id?: string
          notes?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          to_bank_id?: string | null
          to_kind?: string
          transfer_date?: string
        }
        Relationships: []
      }
      cash_reconciliations: {
        Row: {
          adjustment_txn_id: string | null
          attachment_url: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          difference: number
          id: string
          is_cancelled: boolean
          note: string | null
          opening_balance: number
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          physical_balance: number
          posted_at: string
          posted_by: string | null
          recon_date: string
          responsible_user_id: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          store: string | null
          system_balance: number
        }
        Insert: {
          adjustment_txn_id?: string | null
          attachment_url?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          difference?: number
          id?: string
          is_cancelled?: boolean
          note?: string | null
          opening_balance?: number
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          physical_balance?: number
          posted_at?: string
          posted_by?: string | null
          recon_date?: string
          responsible_user_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          store?: string | null
          system_balance?: number
        }
        Update: {
          adjustment_txn_id?: string | null
          attachment_url?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          difference?: number
          id?: string
          is_cancelled?: boolean
          note?: string | null
          opening_balance?: number
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          physical_balance?: number
          posted_at?: string
          posted_by?: string | null
          recon_date?: string
          responsible_user_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          store?: string | null
          system_balance?: number
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string
          id: string
          notes: string | null
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string
          reference_id: string | null
          reference_type: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          txn_date: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction: string
          id?: string
          notes?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          reference_id?: string | null
          reference_type?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          txn_date?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          id?: string
          notes?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          reference_id?: string | null
          reference_type?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          txn_date?: string
        }
        Relationships: []
      }
      cheques: {
        Row: {
          amount: number
          bank_account_id: string | null
          cheque_date: string
          cheque_number: string
          cleared_at: string | null
          company_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string
          id: string
          notes: string | null
          party_id: string | null
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string | null
          posted_by: string | null
          posted_txn_id: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          cheque_date?: string
          cheque_number: string
          cleared_at?: string | null
          company_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction: string
          id?: string
          notes?: string | null
          party_id?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posted_txn_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          cheque_date?: string
          cheque_number?: string
          cleared_at?: string | null
          company_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          id?: string
          notes?: string | null
          party_id?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posted_txn_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cod_receipts: {
        Row: {
          account_id: string | null
          amount: number
          company_id: string
          created_at: string | null
          id: string
          notes: string | null
          received_at: string
          reference_no: string | null
          settlement_id: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          company_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          received_at?: string
          reference_no?: string | null
          settlement_id: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          received_at?: string
          reference_no?: string | null
          settlement_id?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_receipts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_receipts_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "cod_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_settlements: {
        Row: {
          cod_amount: number
          company_id: string
          courier_charge: number
          courier_id: string | null
          created_at: string | null
          id: string
          order_id: string
          pending_amount: number
          receivable_amount: number
          received_amount: number
          status: string
          updated_at: string | null
        }
        Insert: {
          cod_amount?: number
          company_id: string
          courier_charge?: number
          courier_id?: string | null
          created_at?: string | null
          id?: string
          order_id: string
          pending_amount?: number
          receivable_amount?: number
          received_amount?: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          cod_amount?: number
          company_id?: string
          courier_charge?: number
          courier_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string
          pending_amount?: number
          receivable_amount?: number
          received_amount?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_settlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_settlements_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          business_type: string | null
          created_at: string
          currency: string
          email: string | null
          fiscal_year_start: string
          gst_number: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          settings: Json
          signature_url: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          fiscal_year_start?: string
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          settings?: Json
          signature_url?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_type?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          fiscal_year_start?: string
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          settings?: Json
          signature_url?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_feature_overrides: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          enabled: boolean
          expires_at: string | null
          feature_key: string
          id: string
          internal_note: string | null
          is_beta: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          feature_key: string
          id?: string
          internal_note?: string | null
          is_beta?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          feature_key?: string
          id?: string
          internal_note?: string | null
          is_beta?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_subscriptions: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string | null
          plan_key: string | null
          starts_at: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          plan_key?: string | null
          starts_at?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          plan_key?: string | null
          starts_at?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          preferred_contact: string
          request_type: string
          status: string
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          preferred_contact?: string
          request_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          preferred_contact?: string
          request_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          work_entry_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          payment_id: string
          work_entry_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          work_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "contract_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_allocations_work_entry_id_fkey"
            columns: ["work_entry_id"]
            isOneToOne: false
            referencedRelation: "contract_work_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          employee_id: string
          id: string
          method: string
          notes: string | null
          payment_date: string
          posted_txn_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          posted_txn_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          posted_txn_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_work_entries: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          employee_id: string
          id: string
          item_id: string | null
          notes: string | null
          paid_amount: number
          production_ref: string | null
          qty: number
          rate: number
          status: string
          total: number
          updated_at: string
          work_date: string
          work_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          id?: string
          item_id?: string | null
          notes?: string | null
          paid_amount?: number
          production_ref?: string | null
          qty?: number
          rate?: number
          status?: string
          total?: number
          updated_at?: string
          work_date?: string
          work_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          id?: string
          item_id?: string | null
          notes?: string | null
          paid_amount?: number
          production_ref?: string | null
          qty?: number
          rate?: number
          status?: string
          total?: number
          updated_at?: string
          work_date?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_work_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_work_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          company_id: string | null
          coupon_id: string
          discount_applied: number
          id: string
          payment_request_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          coupon_id: string
          discount_applied?: number
          id?: string
          payment_request_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          coupon_id?: string
          discount_applied?: number
          id?: string
          payment_request_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "platform_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couriers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_attachments: {
        Row: {
          attachment_kind: string
          company_id: string
          created_at: string
          deleted_at: string | null
          document_id: string
          document_type: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          attachment_kind: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          document_id: string
          document_type: string
          file_name: string
          file_size: number
          file_type: string
          id?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          attachment_kind?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          document_id?: string
          document_type?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          employee_id: string
          id: string
          method: string
          notes: string | null
          payment_date: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string
          posted_by: string | null
          posted_txn_id: string | null
          reference_no: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          employee_id: string
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          reference_no?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          employee_id?: string
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          reference_no?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          address: string | null
          base_salary: number
          code: string | null
          company_id: string
          created_at: string
          daily_wage: number
          department: string | null
          designation: string | null
          email: string | null
          id: string
          is_active: boolean
          joining_date: string | null
          name: string
          notes: string | null
          overtime_rate: number
          pay_type: string
          payment_method: string | null
          phone: string | null
          salary_type: string
          updated_at: string
          wage_type: string
        }
        Insert: {
          address?: string | null
          base_salary?: number
          code?: string | null
          company_id: string
          created_at?: string
          daily_wage?: number
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          name: string
          notes?: string | null
          overtime_rate?: number
          pay_type?: string
          payment_method?: string | null
          phone?: string | null
          salary_type?: string
          updated_at?: string
          wage_type?: string
        }
        Update: {
          address?: string | null
          base_salary?: number
          code?: string | null
          company_id?: string
          created_at?: string
          daily_wage?: number
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          name?: string
          notes?: string | null
          overtime_rate?: number
          pay_type?: string
          payment_method?: string | null
          phone?: string | null
          salary_type?: string
          updated_at?: string
          wage_type?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          color: string
          company_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          restored_at: string | null
          restored_by: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string | null
          category: string
          category_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          expense_date: string
          expense_no: string | null
          id: string
          is_recurring: boolean
          notes: string | null
          payment_method: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string
          posted_by: string | null
          posted_txn_id: string | null
          recurrence: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          store: string | null
          tax: number
          vendor: string | null
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category: string
          category_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expense_date?: string
          expense_no?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          payment_method?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          recurrence?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          store?: string | null
          tax?: number
          vendor?: string | null
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category?: string
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expense_date?: string
          expense_no?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          payment_method?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          recurrence?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          store?: string | null
          tax?: number
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          color: string
          company_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          restored_at: string | null
          restored_by: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      item_manufacturing_recipe_lines: {
        Row: {
          created_at: string | null
          id: string
          material_item_id: string
          purchase_price_at_time: number | null
          qty: number
          recipe_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          material_item_id: string
          purchase_price_at_time?: number | null
          qty?: number
          recipe_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          material_item_id?: string
          purchase_price_at_time?: number | null
          qty?: number
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_manufacturing_recipe_lines_material_item_id_fkey"
            columns: ["material_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_manufacturing_recipe_lines_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "item_manufacturing_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      item_manufacturing_recipes: {
        Row: {
          additional_cost: number | null
          company_id: string
          created_at: string | null
          id: string
          item_id: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          additional_cost?: number | null
          company_id: string
          created_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_cost?: number | null
          company_id?: string
          created_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_manufacturing_recipes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_store_stock: {
        Row: {
          company_id: string
          created_at: string
          id: string
          item_id: string
          opening_stock: number
          qty: number
          updated_at: string
          variant_id: string | null
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          item_id: string
          opening_stock?: number
          qty?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string
          opening_stock?: number
          qty?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string
        }
        Relationships: []
      }
      item_variants: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          item_id: string
          low_stock_alert: number | null
          model: string | null
          mrp: number
          name: string
          purchase_price: number
          sale_price: number
          size: string | null
          sku: string | null
          stock: number
          unit: string
          updated_at: string | null
          wholesale_price: number
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_id: string
          low_stock_alert?: number | null
          model?: string | null
          mrp?: number
          name: string
          purchase_price?: number
          sale_price?: number
          size?: string | null
          sku?: string | null
          stock?: number
          unit?: string
          updated_at?: string | null
          wholesale_price?: number
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_id?: string
          low_stock_alert?: number | null
          model?: string | null
          mrp?: number
          name?: string
          purchase_price?: number
          sale_price?: number
          size?: string | null
          sku?: string | null
          stock?: number
          unit?: string
          updated_at?: string | null
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          barcode: string | null
          category: string | null
          category_id: string | null
          company_id: string
          created_at: string
          damaged_stock: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_service: boolean
          low_stock_alert: number | null
          mrp: number
          name: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          purchase_price: number
          restored_at: string | null
          restored_by: string | null
          sale_price: number
          sku: string | null
          stock: number
          tax_rate: number
          unit: string
          unit_default: string | null
          updated_at: string
          wholesale_price: number
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          damaged_stock?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_service?: boolean
          low_stock_alert?: number | null
          mrp?: number
          name: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          purchase_price?: number
          restored_at?: string | null
          restored_by?: string | null
          sale_price?: number
          sku?: string | null
          stock?: number
          tax_rate?: number
          unit?: string
          unit_default?: string | null
          updated_at?: string
          wholesale_price?: number
        }
        Update: {
          barcode?: string | null
          category?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          damaged_stock?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_service?: boolean
          low_stock_alert?: number | null
          mrp?: number
          name?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          purchase_price?: number
          restored_at?: string | null
          restored_by?: string | null
          sale_price?: number
          sku?: string | null
          stock?: number
          tax_rate?: number
          unit?: string
          unit_default?: string | null
          updated_at?: string
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_rates: {
        Row: {
          company_id: string
          created_at: string
          effective_date: string
          employee_id: string | null
          id: string
          is_active: boolean
          item_id: string
          notes: string | null
          rate: number
          unit: string | null
          updated_at: string
          work_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          effective_date?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          item_id: string
          notes?: string | null
          rate?: number
          unit?: string | null
          updated_at?: string
          work_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          effective_date?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          item_id?: string
          notes?: string | null
          rate?: number
          unit?: string | null
          updated_at?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "labour_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labour_rates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          interest_amount: number
          loan_id: string
          method: string
          notes: string | null
          payment_date: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string
          posted_by: string | null
          posted_txn_id: string | null
          principal_amount: number
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          interest_amount?: number
          loan_id: string
          method?: string
          notes?: string | null
          payment_date?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          principal_amount?: number
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          interest_amount?: number
          loan_id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          principal_amount?: number
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          company_id: string
          counterparty_type: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          due_date: string | null
          end_date: string | null
          id: string
          interest_rate: number
          lender_name: string
          notes: string | null
          outstanding: number
          payment_account_kind: string | null
          payment_bank_id: string | null
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          principal: number
          restored_at: string | null
          restored_by: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          counterparty_type?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          end_date?: string | null
          id?: string
          interest_rate?: number
          lender_name: string
          notes?: string | null
          outstanding?: number
          payment_account_kind?: string | null
          payment_bank_id?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          principal?: number
          restored_at?: string | null
          restored_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          counterparty_type?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          end_date?: string | null
          id?: string
          interest_rate?: number
          lender_name?: string
          notes?: string | null
          outstanding?: number
          payment_account_kind?: string | null
          payment_bank_id?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          principal?: number
          restored_at?: string | null
          restored_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          budget: number | null
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          platform: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          platform: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          platform?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_costs: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string | null
          campaign_id: string
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string
          id: string
          item_id: string | null
          item_variant_id: string | null
          notes: string | null
          online_order_id: string | null
          payment_method: string | null
          posted_txn_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          campaign_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string
          id?: string
          item_id?: string | null
          item_variant_id?: string | null
          notes?: string | null
          online_order_id?: string | null
          payment_method?: string | null
          posted_txn_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          campaign_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string
          id?: string
          item_id?: string | null
          item_variant_id?: string | null
          notes?: string | null
          online_order_id?: string | null
          payment_method?: string | null
          posted_txn_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_costs_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_item_variant_id_fkey"
            columns: ["item_variant_id"]
            isOneToOne: false
            referencedRelation: "item_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_posted_txn_id_fkey"
            columns: ["posted_txn_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_status_logs: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          from_status: string | null
          id: string
          notes: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_order_status_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_status_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      online_orders: {
        Row: {
          cod_amount: number
          company_id: string
          converted_at: string | null
          converted_by: string | null
          courier_charge: number
          courier_id: string | null
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_charge: number
          delivery_note: string | null
          delivery_status: string | null
          expected_delivery_date: string | null
          id: string
          items: Json
          notes: string | null
          order_no: string
          sale_invoice_id: string | null
          sale_order_id: string | null
          status: string
          subtotal: number
          total: number
          tracking_id: string | null
          updated_at: string
        }
        Insert: {
          cod_amount?: number
          company_id: string
          converted_at?: string | null
          converted_by?: string | null
          courier_charge?: number
          courier_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_charge?: number
          delivery_note?: string | null
          delivery_status?: string | null
          expected_delivery_date?: string | null
          id?: string
          items?: Json
          notes?: string | null
          order_no: string
          sale_invoice_id?: string | null
          sale_order_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          tracking_id?: string | null
          updated_at?: string
        }
        Update: {
          cod_amount?: number
          company_id?: string
          converted_at?: string | null
          converted_by?: string | null
          courier_charge?: number
          courier_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_charge?: number
          delivery_note?: string | null
          delivery_status?: string | null
          expected_delivery_date?: string | null
          id?: string
          items?: Json
          notes?: string | null
          order_no?: string
          sale_invoice_id?: string | null
          sale_order_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          tracking_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_sale_invoice_id_fkey"
            columns: ["sale_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      online_store_items: {
        Row: {
          company_id: string
          created_at: string
          featured: boolean
          id: string
          item_id: string
          online_category: string | null
          online_description: string | null
          online_image_url: string | null
          online_price: number | null
          sort_order: number
          synced_at: string | null
          updated_at: string
          visible: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          featured?: boolean
          id?: string
          item_id: string
          online_category?: string | null
          online_description?: string | null
          online_image_url?: string | null
          online_price?: number | null
          sort_order?: number
          synced_at?: string | null
          updated_at?: string
          visible?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          featured?: boolean
          id?: string
          item_id?: string
          online_category?: string | null
          online_description?: string | null
          online_image_url?: string | null
          online_price?: number | null
          sort_order?: number
          synced_at?: string | null
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "online_store_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_store_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      online_store_settings: {
        Row: {
          company_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          settings: Json
          slug: string
          store_name: string
          updated_at: string
          view_count: number
          whatsapp_number: string | null
        }
        Insert: {
          company_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          settings?: Json
          slug: string
          store_name: string
          updated_at?: string
          view_count?: number
          whatsapp_number?: string | null
        }
        Update: {
          company_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          settings?: Json
          slug?: string
          store_name?: string
          updated_at?: string
          view_count?: number
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      other_income_categories: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_income_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      other_incomes: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string | null
          category_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          income_date: string
          notes: string | null
          party_source: string | null
          payment_method: string | null
          reference_no: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          income_date?: string
          notes?: string | null
          party_source?: string | null
          payment_method?: string | null
          reference_no?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          income_date?: string
          notes?: string | null
          party_source?: string | null
          payment_method?: string | null
          reference_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_incomes_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_incomes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "other_income_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_incomes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          address: string | null
          balance: number
          company_id: string
          created_at: string
          credit_limit: number | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          group_id: string | null
          gst_number: string | null
          id: string
          loyalty_points: number
          name: string
          notes: string | null
          opening_balance: number
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          phone: string | null
          restored_at: string | null
          restored_by: string | null
          shipping_address: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          company_id: string
          created_at?: string
          credit_limit?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          group_id?: string | null
          gst_number?: string | null
          id?: string
          loyalty_points?: number
          name: string
          notes?: string | null
          opening_balance?: number
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          phone?: string | null
          restored_at?: string | null
          restored_by?: string | null
          shipping_address?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          company_id?: string
          created_at?: string
          credit_limit?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          group_id?: string | null
          gst_number?: string | null
          id?: string
          loyalty_points?: number
          name?: string
          notes?: string | null
          opening_balance?: number
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          phone?: string | null
          restored_at?: string | null
          restored_by?: string | null
          shipping_address?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      party_groups: {
        Row: {
          company_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          restored_at: string | null
          restored_by: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          admin_note: string | null
          amount: number
          billing_period: string
          company_id: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          discount_amount: number
          id: string
          method: string
          plan: string
          plan_id: string | null
          proof_url: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_path: string | null
          sender_info: string
          status: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount?: number
          billing_period?: string
          company_id?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          id?: string
          method: string
          plan: string
          plan_id?: string | null
          proof_url?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          sender_info: string
          status?: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          billing_period?: string
          company_id?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          id?: string
          method?: string
          plan?: string
          plan_id?: string | null
          proof_url?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          sender_info?: string
          status?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "platform_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          account_name: string | null
          account_number: string | null
          api_key: string | null
          created_at: string
          id: string
          instructions: string | null
          is_active: boolean
          label: string
          logo_url: string | null
          max_amount: number | null
          method: string
          min_amount: number
          payment_type: string
          sandbox_mode: boolean
          sort_order: number
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          api_key?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          label: string
          logo_url?: string | null
          max_amount?: number | null
          method: string
          min_amount?: number
          payment_type?: string
          sandbox_mode?: boolean
          sort_order?: number
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          api_key?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          label?: string
          logo_url?: string | null
          max_amount?: number | null
          method?: string
          min_amount?: number
          payment_type?: string
          sandbox_mode?: boolean
          sort_order?: number
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string
          id: string
          method: string
          notes: string | null
          party_id: string | null
          payment_date: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string
          posted_by: string | null
          posted_txn_id: string | null
          reference_no: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction: string
          id?: string
          method?: string
          notes?: string | null
          party_id?: string | null
          payment_date?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          reference_no?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          id?: string
          method?: string
          notes?: string | null
          party_id?: string | null
          payment_date?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string
          posted_by?: string | null
          posted_txn_id?: string | null
          reference_no?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          mfa_required: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mfa_required?: boolean
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mfa_required?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_announcements: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          is_dismissible: boolean
          message: string
          starts_at: string
          target_company_id: string | null
          target_plan: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_dismissible?: boolean
          message: string
          starts_at?: string
          target_company_id?: string | null
          target_plan?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_dismissible?: boolean
          message?: string
          starts_at?: string
          target_company_id?: string | null
          target_plan?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      platform_coupons: {
        Row: {
          billing_period: string
          code: string
          company_id: string | null
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          id: string
          internal_note: string | null
          is_active: boolean
          max_uses: number | null
          plan_key: string | null
          updated_at: string
          used_count: number
          user_id: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          billing_period?: string
          code: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_type: string
          discount_value: number
          id?: string
          internal_note?: string | null
          is_active?: boolean
          max_uses?: number | null
          plan_key?: string | null
          updated_at?: string
          used_count?: number
          user_id?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          billing_period?: string
          code?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          internal_note?: string | null
          is_active?: boolean
          max_uses?: number | null
          plan_key?: string | null
          updated_at?: string
          used_count?: number
          user_id?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          default_currency: string
          default_invoice_prefix: string
          default_receipt_prefix: string
          default_timezone: string
          default_trial_days: number
          demo_login_enabled: boolean
          id: string
          ip_allowlist: Json
          is_singleton: boolean
          maintenance_message: string | null
          maintenance_mode: boolean
          platform_logo_url: string | null
          platform_name: string
          privacy_url: string | null
          signup_enabled: boolean
          support_email: string | null
          support_phone: string | null
          support_whatsapp: string | null
          terms_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          default_currency?: string
          default_invoice_prefix?: string
          default_receipt_prefix?: string
          default_timezone?: string
          default_trial_days?: number
          demo_login_enabled?: boolean
          id?: string
          ip_allowlist?: Json
          is_singleton?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          platform_logo_url?: string | null
          platform_name?: string
          privacy_url?: string | null
          signup_enabled?: boolean
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
          terms_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          default_currency?: string
          default_invoice_prefix?: string
          default_receipt_prefix?: string
          default_timezone?: string
          default_trial_days?: number
          demo_login_enabled?: boolean
          id?: string
          ip_allowlist?: Json
          is_singleton?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          platform_logo_url?: string | null
          platform_name?: string
          privacy_url?: string | null
          signup_enabled?: boolean
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
          terms_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          amount: number
          description: string | null
          discount_pct: number
          id: string
          item_id: string | null
          item_name: string
          price: number
          purchase_id: string
          qty: number
          tax_pct: number
          unit: string
          variant_id: string | null
        }
        Insert: {
          amount?: number
          description?: string | null
          discount_pct?: number
          id?: string
          item_id?: string | null
          item_name: string
          price?: number
          purchase_id: string
          qty?: number
          tax_pct?: number
          unit?: string
          variant_id?: string | null
        }
        Update: {
          amount?: number
          description?: string | null
          discount_pct?: number
          id?: string
          item_id?: string | null
          item_name?: string
          price?: number
          purchase_id?: string
          qty?: number
          tax_pct?: number
          unit?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "item_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          balance: number
          bill_date: string
          bill_no: string
          company_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount: number
          doc_type: string
          due_date: string | null
          id: string
          notes: string | null
          paid: number
          party_id: string | null
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          reference_purchase_id: string | null
          restored_at: string | null
          restored_by: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          balance?: number
          bill_date?: string
          bill_no: string
          company_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number
          doc_type?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: number
          party_id?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          reference_purchase_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          bill_date?: string
          bill_no?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number
          doc_type?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: number
          party_id?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          reference_purchase_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      recycle_bin: {
        Row: {
          amount: number | null
          company_id: string
          deleted_at: string
          deleted_by: string | null
          entity_id: string
          entity_type: string
          id: string
          module: string | null
          party_name: string | null
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          reason: string | null
          reference_no: string | null
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
          status: string
        }
        Insert: {
          amount?: number | null
          company_id: string
          deleted_at?: string
          deleted_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          module?: string | null
          party_name?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          reason?: string | null
          reference_no?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
          status?: string
        }
        Update: {
          amount?: number | null
          company_id?: string
          deleted_at?: string
          deleted_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          module?: string | null
          party_name?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          reason?: string | null
          reference_no?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
          status?: string
        }
        Relationships: []
      }
      replacement_items: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          item_id: string
          qty: number
          return_id: string
          total_amount: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          item_id: string
          qty?: number
          return_id: string
          total_amount?: number
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          item_id?: string
          qty?: number
          return_id?: string
          total_amount?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replacement_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_exchange"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "item_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      return_exchange: {
        Row: {
          company_id: string
          created_at: string | null
          customer_id: string | null
          delivery_charge: number
          id: string
          item_id: string | null
          notes: string | null
          order_id: string | null
          qty: number
          reason: string
          refund_account_id: string | null
          refund_amount: number
          refund_status: string
          restock_option: string
          return_date: string
          sale_id: string | null
          transaction_id: string | null
          type: string
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          customer_id?: string | null
          delivery_charge?: number
          id?: string
          item_id?: string | null
          notes?: string | null
          order_id?: string | null
          qty?: number
          reason: string
          refund_account_id?: string | null
          refund_amount?: number
          refund_status?: string
          restock_option: string
          return_date?: string
          sale_id?: string | null
          transaction_id?: string | null
          type: string
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          customer_id?: string | null
          delivery_charge?: number
          id?: string
          item_id?: string | null
          notes?: string | null
          order_id?: string | null
          qty?: number
          reason?: string
          refund_account_id?: string | null
          refund_amount?: number
          refund_status?: string
          restock_option?: string
          return_date?: string
          sale_id?: string | null
          transaction_id?: string | null
          type?: string
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_exchange_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_exchange_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_exchange_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_exchange_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_exchange_refund_account_id_fkey"
            columns: ["refund_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_exchange_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_exchange_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "item_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          permissions: Json
          role: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          permissions?: Json
          role: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      salary_slips: {
        Row: {
          advance: number
          bonus: number
          company_id: string
          created_at: string
          days_present: number
          days_total: number
          deductions: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          due: number
          employee_id: string
          gross: number
          id: string
          net: number
          notes: string | null
          paid_on: string | null
          period_month: string
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          posted_at: string | null
          posted_by: string | null
          posted_txn_id: string | null
          restored_at: string | null
          restored_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          advance?: number
          bonus?: number
          company_id: string
          created_at?: string
          days_present?: number
          days_total?: number
          deductions?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due?: number
          employee_id: string
          gross?: number
          id?: string
          net?: number
          notes?: string | null
          paid_on?: string | null
          period_month: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posted_txn_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          advance?: number
          bonus?: number
          company_id?: string
          created_at?: string
          days_present?: number
          days_total?: number
          deductions?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due?: number
          employee_id?: string
          gross?: number
          id?: string
          net?: number
          notes?: string | null
          paid_on?: string | null
          period_month?: string
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posted_txn_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          amount: number
          description: string | null
          discount_pct: number
          id: string
          item_id: string | null
          item_name: string
          price: number
          qty: number
          sale_id: string
          tax_pct: number
          unit: string
          variant_id: string | null
        }
        Insert: {
          amount?: number
          description?: string | null
          discount_pct?: number
          id?: string
          item_id?: string | null
          item_name: string
          price?: number
          qty?: number
          sale_id: string
          tax_pct?: number
          unit?: string
          variant_id?: string | null
        }
        Update: {
          amount?: number
          description?: string | null
          discount_pct?: number
          id?: string
          item_id?: string | null
          item_name?: string
          price?: number
          qty?: number
          sale_id?: string
          tax_pct?: number
          unit?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "item_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          balance: number
          billing_name: string | null
          company_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_charge: number
          discount: number
          doc_type: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_no: string
          labor_charge: number
          notes: string | null
          paid: number
          party_id: string | null
          payment_method: string | null
          permanently_deleted_at: string | null
          permanently_deleted_by: string | null
          po_date: string | null
          po_no: string | null
          reference_sale_id: string | null
          restored_at: string | null
          restored_by: string | null
          round_off: number
          source_id: string | null
          source_type: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          balance?: number
          billing_name?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_charge?: number
          discount?: number
          doc_type?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no: string
          labor_charge?: number
          notes?: string | null
          paid?: number
          party_id?: string | null
          payment_method?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          po_date?: string | null
          po_no?: string | null
          reference_sale_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          round_off?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          billing_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_charge?: number
          discount?: number
          doc_type?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          labor_charge?: number
          notes?: string | null
          paid?: number
          party_id?: string | null
          payment_method?: string | null
          permanently_deleted_at?: string | null
          permanently_deleted_by?: string | null
          po_date?: string | null
          po_no?: string | null
          reference_sale_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          round_off?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_audit_views: {
        Row: {
          company_id: string | null
          created_at: string
          filters: Json
          id: string
          name: string
          owner_user_id: string
          scope: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          filters?: Json
          id?: string
          name: string
          owner_user_id: string
          scope: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          owner_user_id?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_audit_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_kv: {
        Row: {
          company_id: string
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          adjustment_date: string
          company_id: string
          created_at: string
          id: string
          item_id: string
          notes: string | null
          qty_change: number
          reason: string
        }
        Insert: {
          adjustment_date?: string
          company_id: string
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          qty_change: number
          reason?: string
        }
        Update: {
          adjustment_date?: string
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          qty_change?: number
          reason?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          company_id: string
          created_at: string
          direction: string
          id: string
          item_id: string
          movement_date: string
          note: string | null
          qty: number
          reference_id: string | null
          reference_no: string | null
          reference_type: string | null
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          direction: string
          id?: string
          item_id: string
          movement_date?: string
          note?: string | null
          qty: number
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          direction?: string
          id?: string
          item_id?: string
          movement_date?: string
          note?: string | null
          qty?: number
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "item_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          qty: number
          transfer_id: string
          unit: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          qty?: number
          transfer_id: string
          unit?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          qty?: number
          transfer_id?: string
          unit?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          from_warehouse_id: string | null
          id: string
          note: string | null
          posted_by: string | null
          to_warehouse_id: string | null
          transfer_date: string
          transfer_no: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_warehouse_id?: string | null
          id?: string
          note?: string | null
          posted_by?: string | null
          to_warehouse_id?: string | null
          transfer_date?: string
          transfer_no?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_warehouse_id?: string | null
          id?: string
          note?: string | null
          posted_by?: string | null
          to_warehouse_id?: string | null
          transfer_date?: string
          transfer_no?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_active: boolean
          key: string
          label: string
          max_companies: number
          max_devices: number
          monthly_price: number
          price: number
          sort_order: number
          trial_days: number
          updated_at: string
          user_limit: number
          yearly_price: number
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          key: string
          label: string
          max_companies?: number
          max_devices?: number
          monthly_price?: number
          price?: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
          user_limit?: number
          yearly_price?: number
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          max_companies?: number
          max_devices?: number
          monthly_price?: number
          price?: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
          user_limit?: number
          yearly_price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          features: Json
          id: string
          max_companies: number
          max_devices: number
          owner_id: string
          plan: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          features?: Json
          id?: string
          max_companies?: number
          max_devices?: number
          owner_id: string
          plan?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          features?: Json
          id?: string
          max_companies?: number
          max_devices?: number
          owner_id?: string
          plan?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          company_id: string | null
          created_at: string
          id: string
          last_reply_at: string | null
          module: string | null
          priority: string
          proof_url: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          last_reply_at?: string | null
          module?: string | null
          priority?: string
          proof_url?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          last_reply_at?: string | null
          module?: string | null
          priority?: string
          proof_url?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          rate: number
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          rate?: number
          type?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          rate?: number
          type?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          symbol: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          symbol: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      platform_public_settings: {
        Row: {
          demo_login_enabled: boolean | null
          id: string | null
          maintenance_message: string | null
          maintenance_mode: boolean | null
          platform_name: string | null
          signup_enabled: boolean | null
          support_email: string | null
          support_phone: string | null
          support_whatsapp: string | null
        }
        Insert: {
          demo_login_enabled?: boolean | null
          id?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean | null
          platform_name?: string | null
          signup_enabled?: boolean | null
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
        }
        Update: {
          demo_login_enabled?: boolean | null
          id?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean | null
          platform_name?: string | null
          signup_enabled?: boolean | null
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_platform_admin_by_email: { Args: { _email: string }; Returns: string }
      company_feature_resolved: {
        Args: { _company: string; _feature: string }
        Returns: boolean
      }
      company_has_active_subscription: {
        Args: { _company: string }
        Returns: boolean
      }
      company_has_feature: {
        Args: { _company: string; _feature: string }
        Returns: boolean
      }
      company_owner: { Args: { _company: string }; Returns: string }
      current_company_count: { Args: { _user: string }; Returns: number }
      current_device_count: { Args: { _user: string }; Returns: number }
      get_platform_settings_admin: {
        Args: never
        Returns: {
          created_at: string
          default_currency: string
          default_invoice_prefix: string
          default_receipt_prefix: string
          default_timezone: string
          default_trial_days: number
          demo_login_enabled: boolean
          id: string
          ip_allowlist: Json
          is_singleton: boolean
          maintenance_message: string | null
          maintenance_mode: boolean
          platform_logo_url: string | null
          platform_name: string
          privacy_url: string | null
          signup_enabled: boolean
          support_email: string | null
          support_phone: string | null
          support_whatsapp: string | null
          terms_url: string | null
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_platform_settings: {
        Args: never
        Returns: {
          demo_login_enabled: boolean
          maintenance_message: string
          maintenance_mode: boolean
          platform_name: string
          signup_enabled: boolean
          support_email: string
          support_phone: string
          support_whatsapp: string
        }[]
      }
      has_active_subscription: { Args: { _user: string }; Returns: boolean }
      has_company_access: {
        Args: { _company: string; _user: string }
        Returns: boolean
      }
      has_company_role: {
        Args: {
          _company: string
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: boolean
      }
      has_feature_access: {
        Args: { _feature: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_permission: {
        Args: { _company: string; _key: string; _user: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_ip_allowed: { Args: { _ip: string }; Returns: boolean }
      is_platform_admin: { Args: { _user: string }; Returns: boolean }
      log_audit_event: {
        Args: {
          _action: string
          _amount_impact?: number
          _company_id: string
          _entity_id?: string
          _entity_type?: string
          _metadata?: Json
          _module: string
          _new_value?: Json
          _old_value?: Json
          _reference_no?: string
          _status?: string
          _user_agent?: string
        }
        Returns: string
      }
      log_platform_audit: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: string
      }
      platform_mark_stale_devices: { Args: { _days?: number }; Returns: number }
      remove_platform_admin: { Args: { _user_id: string }; Returns: undefined }
      seed_default_couriers: {
        Args: { target_company_id: string }
        Returns: undefined
      }
      user_max_companies: { Args: { _user: string }; Returns: number }
      user_max_devices: { Args: { _user: string }; Returns: number }
      validate_coupon: {
        Args: {
          _billing_period: string
          _code: string
          _company_id: string
          _plan_key: string
          _user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "accountant"
        | "salesperson"
        | "viewer"
        | "manager"
        | "salesman"
        | "biller"
        | "stock_keeper"
        | "hr_manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "owner",
        "admin",
        "accountant",
        "salesperson",
        "viewer",
        "manager",
        "salesman",
        "biller",
        "stock_keeper",
        "hr_manager",
      ],
    },
  },
} as const

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      shops: {
        Row: {
          id: string
          name: string
          slug: string
          address: string | null
          phone: string | null
          email: string | null
          timezone: string
          currency: string
          booking_lead_time_minutes: number
          booking_window_days: number
          cancellation_policy_hours: number
          deposit_percentage: number
          require_deposit: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          address?: string | null
          phone?: string | null
          email?: string | null
          timezone?: string
          currency?: string
          booking_lead_time_minutes?: number
          booking_window_days?: number
          cancellation_policy_hours?: number
          deposit_percentage?: number
          require_deposit?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          address?: string | null
          phone?: string | null
          email?: string | null
          timezone?: string
          currency?: string
          booking_lead_time_minutes?: number
          booking_window_days?: number
          cancellation_policy_hours?: number
          deposit_percentage?: number
          require_deposit?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          shop_id: string | null
          auth_id: string | null
          email: string
          first_name: string
          last_name: string
          phone: string | null
          avatar_url: string | null
          role: 'customer' | 'barber' | 'admin' | 'owner'
          bio: string | null
          specialties: string[] | null
          is_active: boolean
          display_order: number
          email_notifications: boolean
          sms_notifications: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id?: string | null
          auth_id?: string | null
          email: string
          first_name: string
          last_name: string
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'barber' | 'admin' | 'owner'
          bio?: string | null
          specialties?: string[] | null
          is_active?: boolean
          display_order?: number
          email_notifications?: boolean
          sms_notifications?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string | null
          auth_id?: string | null
          email?: string
          first_name?: string
          last_name?: string
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'barber' | 'admin' | 'owner'
          bio?: string | null
          specialties?: string[] | null
          is_active?: boolean
          display_order?: number
          email_notifications?: boolean
          sms_notifications?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      services: {
        Row: {
          id: string
          shop_id: string
          name: string
          description: string | null
          duration_minutes: number
          price: number
          deposit_amount: number | null
          category: string | null
          is_active: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          name: string
          description?: string | null
          duration_minutes: number
          price: number
          deposit_amount?: number | null
          category?: string | null
          is_active?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          name?: string
          description?: string | null
          duration_minutes?: number
          price?: number
          deposit_amount?: number | null
          category?: string | null
          is_active?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      barber_services: {
        Row: {
          id: string
          barber_id: string
          service_id: string
          price_override: number | null
          duration_override: number | null
          created_at: string
        }
        Insert: {
          id?: string
          barber_id: string
          service_id: string
          price_override?: number | null
          duration_override?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          barber_id?: string
          service_id?: string
          price_override?: number | null
          duration_override?: number | null
          created_at?: string
        }
      }
      business_hours: {
        Row: {
          id: string
          shop_id: string
          barber_id: string | null
          day_of_week: number
          open_time: string
          close_time: string
          is_closed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          barber_id?: string | null
          day_of_week: number
          open_time: string
          close_time: string
          is_closed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          barber_id?: string | null
          day_of_week?: number
          open_time?: string
          close_time?: string
          is_closed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      time_blocks: {
        Row: {
          id: string
          shop_id: string
          barber_id: string | null
          block_type: string
          title: string | null
          start_datetime: string
          end_datetime: string
          recurrence_rule: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          barber_id?: string | null
          block_type: string
          title?: string | null
          start_datetime: string
          end_datetime: string
          recurrence_rule?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          barber_id?: string | null
          block_type?: string
          title?: string | null
          start_datetime?: string
          end_datetime?: string
          recurrence_rule?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      appointments: {
        Row: {
          id: string
          shop_id: string
          customer_id: string
          barber_id: string
          service_id: string
          start_time: string
          end_time: string
          service_price: number
          deposit_amount: number
          status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
          notes: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          cancelled_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          customer_id: string
          barber_id: string
          service_id: string
          start_time: string
          end_time: string
          service_price: number
          deposit_amount?: number
          status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
          notes?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          customer_id?: string
          barber_id?: string
          service_id?: string
          start_time?: string
          end_time?: string
          service_price?: number
          deposit_amount?: number
          status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
          notes?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          shop_id: string
          appointment_id: string
          stripe_payment_intent_id: string | null
          stripe_charge_id: string | null
          amount: number
          currency: string
          status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'
          payment_type: 'deposit' | 'full_payment' | 'remaining_balance'
          refunded_amount: number
          refund_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          appointment_id: string
          stripe_payment_intent_id?: string | null
          stripe_charge_id?: string | null
          amount: number
          currency?: string
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'
          payment_type: 'deposit' | 'full_payment' | 'remaining_balance'
          refunded_amount?: number
          refund_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          appointment_id?: string
          stripe_payment_intent_id?: string | null
          stripe_charge_id?: string | null
          amount?: number
          currency?: string
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'
          payment_type?: 'deposit' | 'full_payment' | 'remaining_balance'
          refunded_amount?: number
          refund_reason?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          shop_id: string
          user_id: string
          appointment_id: string | null
          notification_type: string
          channel: string
          status: string
          subject: string | null
          body_preview: string | null
          sent_at: string | null
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          user_id: string
          appointment_id?: string | null
          notification_type: string
          channel: string
          status?: string
          subject?: string | null
          body_preview?: string | null
          sent_at?: string | null
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          user_id?: string
          appointment_id?: string | null
          notification_type?: string
          channel?: string
          status?: string
          subject?: string | null
          body_preview?: string | null
          sent_at?: string | null
          error_message?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_shop_id: {
        Args: Record<string, never>
        Returns: string
      }
      is_admin_or_owner: {
        Args: Record<string, never>
        Returns: boolean
      }
      get_current_user_id: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type Shop = Database['public']['Tables']['shops']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type BarberService = Database['public']['Tables']['barber_services']['Row']
export type BusinessHours = Database['public']['Tables']['business_hours']['Row']
export type TimeBlock = Database['public']['Tables']['time_blocks']['Row']
export type Appointment = Database['public']['Tables']['appointments']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']

// Insert types
export type ShopInsert = Database['public']['Tables']['shops']['Insert']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type ServiceInsert = Database['public']['Tables']['services']['Insert']
export type AppointmentInsert = Database['public']['Tables']['appointments']['Insert']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']

// Update types
export type ShopUpdate = Database['public']['Tables']['shops']['Update']
export type UserUpdate = Database['public']['Tables']['users']['Update']
export type ServiceUpdate = Database['public']['Tables']['services']['Update']
export type AppointmentUpdate = Database['public']['Tables']['appointments']['Update']

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
          acuity_calendar_id: string | null
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
          acuity_calendar_id?: string | null
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
          acuity_calendar_id?: string | null
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
      walkins: {
        Row: {
          id: string
          shop_id: string
          created_at: string
          service_type: string
          preference_type: 'ANY' | 'PREFERRED' | 'FASTEST'
          preferred_barber_id: string | null
          status: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'NO_SHOW' | 'DONE' | 'REMOVED'
          position: number
          notes: string | null
          client_id: string | null
          display_name: string | null
          assigned_barber_id: string | null
          called_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          created_at?: string
          service_type?: string
          preference_type?: 'ANY' | 'PREFERRED' | 'FASTEST'
          preferred_barber_id?: string | null
          status?: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'NO_SHOW' | 'DONE' | 'REMOVED'
          position?: number
          notes?: string | null
          client_id?: string | null
          display_name?: string | null
          assigned_barber_id?: string | null
          called_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          created_at?: string
          service_type?: string
          preference_type?: 'ANY' | 'PREFERRED' | 'FASTEST'
          preferred_barber_id?: string | null
          status?: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'NO_SHOW' | 'DONE' | 'REMOVED'
          position?: number
          notes?: string | null
          client_id?: string | null
          display_name?: string | null
          assigned_barber_id?: string | null
          called_at?: string | null
          updated_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          shop_id: string
          first_name: string
          last_initial: string
          phone: string
          display_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          first_name: string
          last_initial: string
          phone: string
          display_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          first_name?: string
          last_initial?: string
          phone?: string
          display_name?: string
          created_at?: string
          updated_at?: string
        }
      }
      barber_status: {
        Row: {
          shop_id: string
          barber_id: string
          status: 'FREE' | 'BUSY' | 'UNAVAILABLE' | 'OFF' | 'UNKNOWN'
          status_detail: string | null
          free_at: string | null
          last_synced_at: string
          updated_at: string
        }
        Insert: {
          shop_id: string
          barber_id: string
          status?: 'FREE' | 'BUSY' | 'UNAVAILABLE' | 'OFF' | 'UNKNOWN'
          status_detail?: string | null
          free_at?: string | null
          last_synced_at?: string
          updated_at?: string
        }
        Update: {
          shop_id?: string
          barber_id?: string
          status?: 'FREE' | 'BUSY' | 'UNAVAILABLE' | 'OFF' | 'UNKNOWN'
          status_detail?: string | null
          free_at?: string | null
          last_synced_at?: string
          updated_at?: string
        }
      }
      barber_state: {
        Row: {
          shop_id: string
          barber_id: string
          state: 'AVAILABLE' | 'IN_CHAIR' | 'ON_BREAK' | 'OFF' | 'CLEANUP' | 'OTHER'
          state_since: string
          manual_free_at: string | null
          updated_at: string
        }
        Insert: {
          shop_id: string
          barber_id: string
          state?: 'AVAILABLE' | 'IN_CHAIR' | 'ON_BREAK' | 'OFF' | 'CLEANUP' | 'OTHER'
          state_since?: string
          manual_free_at?: string | null
          updated_at?: string
        }
        Update: {
          shop_id?: string
          barber_id?: string
          state?: 'AVAILABLE' | 'IN_CHAIR' | 'ON_BREAK' | 'OFF' | 'CLEANUP' | 'OTHER'
          state_since?: string
          manual_free_at?: string | null
          updated_at?: string
        }
      }
      assignments: {
        Row: {
          id: string
          shop_id: string
          walkin_id: string
          barber_id: string
          started_at: string
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          walkin_id: string
          barber_id: string
          started_at?: string
          ended_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          walkin_id?: string
          barber_id?: string
          started_at?: string
          ended_at?: string | null
          created_at?: string
        }
      }
      events: {
        Row: {
          id: string
          shop_id: string
          type: string
          actor_user_id: string | null
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          shop_id: string
          type: string
          actor_user_id?: string | null
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          shop_id?: string
          type?: string
          actor_user_id?: string | null
          payload?: Json
          created_at?: string
        }
      }
      shop_state_projection: {
        Row: {
          shop_id: string
          revision: number
          snapshot: Json
          updated_at: string
        }
        Insert: {
          shop_id: string
          revision?: number
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          shop_id?: string
          revision?: number
          snapshot?: Json
          updated_at?: string
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

// Walk-in truth layer types
export type Walkin = Database['public']['Tables']['walkins']['Row']
export type WalkinInsert = Database['public']['Tables']['walkins']['Insert']
export type WalkinUpdate = Database['public']['Tables']['walkins']['Update']

export type BarberState = Database['public']['Tables']['barber_state']['Row']
export type BarberStateInsert = Database['public']['Tables']['barber_state']['Insert']
export type BarberStateUpdate = Database['public']['Tables']['barber_state']['Update']

export type Assignment = Database['public']['Tables']['assignments']['Row']
export type AssignmentInsert = Database['public']['Tables']['assignments']['Insert']
export type AssignmentUpdate = Database['public']['Tables']['assignments']['Update']

export type WalkinEvent = Database['public']['Tables']['events']['Row']
export type WalkinEventInsert = Database['public']['Tables']['events']['Insert']

export type ShopStateProjection = Database['public']['Tables']['shop_state_projection']['Row']
export type ShopStateProjectionInsert = Database['public']['Tables']['shop_state_projection']['Insert']
export type ShopStateProjectionUpdate = Database['public']['Tables']['shop_state_projection']['Update']

// Kiosk layer types
export type Client = Database['public']['Tables']['clients']['Row']
export type ClientInsert = Database['public']['Tables']['clients']['Insert']

export type BarberStatusRow = Database['public']['Tables']['barber_status']['Row']
export type BarberStatusInsert = Database['public']['Tables']['barber_status']['Insert']
export type BarberStatusUpdate = Database['public']['Tables']['barber_status']['Update']

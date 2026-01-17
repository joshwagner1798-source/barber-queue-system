import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary-900 to-secondary-950">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="text-2xl font-bold text-white">
            BarberShop
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-secondary-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/book"
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Book Now
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Look Sharp.<br />Feel Confident.
          </h1>
          <p className="text-xl text-secondary-300 mb-10">
            Book your next haircut in seconds. Choose your barber, pick a time that works for you, and show up looking your best.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/book"
              className="bg-primary-600 hover:bg-primary-700 text-white text-lg px-8 py-4 rounded-lg transition-colors font-semibold"
            >
              Book an Appointment
            </Link>
            <Link
              href="#services"
              className="border border-secondary-600 hover:border-secondary-500 text-white text-lg px-8 py-4 rounded-lg transition-colors"
            >
              View Services
            </Link>
          </div>
        </div>

        {/* Services Preview */}
        <section id="services" className="mt-32">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Our Services
          </h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <ServiceCard
              name="Classic Haircut"
              price={25}
              duration={30}
              description="Traditional cut with precision and style"
            />
            <ServiceCard
              name="Beard Trim"
              price={15}
              duration={15}
              description="Shape and maintain your facial hair"
            />
            <ServiceCard
              name="Cut & Beard Combo"
              price={35}
              duration={45}
              description="Full service haircut and beard grooming"
            />
          </div>
        </section>

        {/* Hours */}
        <section className="mt-32 max-w-md mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8">
            Hours
          </h2>
          <div className="bg-secondary-800/50 rounded-xl p-6 space-y-3">
            <HoursRow day="Monday - Friday" hours="9:00 AM - 7:00 PM" />
            <HoursRow day="Saturday" hours="9:00 AM - 5:00 PM" />
            <HoursRow day="Sunday" hours="Closed" />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-20 border-t border-secondary-800">
        <div className="text-center text-secondary-500">
          <p>&copy; {new Date().getFullYear()} BarberShop. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function ServiceCard({
  name,
  price,
  duration,
  description,
}: {
  name: string;
  price: number;
  duration: number;
  description: string;
}) {
  return (
    <div className="bg-secondary-800/50 rounded-xl p-6 hover:bg-secondary-800 transition-colors">
      <h3 className="text-xl font-semibold text-white mb-2">{name}</h3>
      <p className="text-secondary-400 text-sm mb-4">{description}</p>
      <div className="flex items-center justify-between text-secondary-300">
        <span className="text-2xl font-bold text-primary-400">${price}</span>
        <span className="text-sm">{duration} min</span>
      </div>
    </div>
  );
}

function HoursRow({ day, hours }: { day: string; hours: string }) {
  return (
    <div className="flex justify-between text-secondary-300">
      <span>{day}</span>
      <span className="font-medium text-white">{hours}</span>
    </div>
  );
}

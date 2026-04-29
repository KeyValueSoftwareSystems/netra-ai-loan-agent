import {
  ArrowRight,
  Shield,
  TrendingUp,
  CreditCard,
  Landmark,
  PhoneCall,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {AskAI}   from "@/components/ai/askAI";
import { EvaluationPanel } from "@/components/ai/evaluationPanel";

const features = [
  {
    icon: Shield,
    title: "Secure Banking",
    description:
      "Enterprise-grade encryption and multi-factor authentication keep your money safe around the clock.",
  },
  {
    icon: TrendingUp,
    title: "Smart Investments",
    description:
      "AI-powered insights help you grow your wealth with personalized portfolio recommendations.",
  },
  {
    icon: CreditCard,
    title: "Rewarding Cards",
    description:
      "Earn cashback, travel points, and exclusive perks with every purchase you make.",
  },
  {
    icon: Globe,
    title: "Global Transfers",
    description:
      "Send and receive money worldwide with low fees and real-time exchange rates.",
  },
];

const stats = [
  { value: "2M+", label: "Active Customers" },
  { value: "$48B", label: "Assets Managed" },
  { value: "99.9%", label: "Uptime Guarantee" },
  { value: "150+", label: "Branch Locations" },
];

const products = [
  {
    title: "Personal Checking",
    description: "Zero-fee everyday banking with cashback rewards.",
    badge: "Popular",
    rate: "0.50% APY",
  },
  {
    title: "High-Yield Savings",
    description: "Grow your savings with our market-leading interest rates.",
    badge: "Best Rate",
    rate: "4.75% APY",
  },
  {
    title: "Home Loans",
    description: "Competitive mortgage rates to help you own your dream home.",
    badge: null,
    rate: "From 5.99%",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Landmark className="size-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">
              Meridian Bank
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#products" className="transition-colors hover:text-foreground">
              Products
            </a>
            <a href="#about" className="transition-colors hover:text-foreground">
              About
            </a>
            <a href="#contact" className="transition-colors hover:text-foreground">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm">
              Log In
            </Button>
            <Button size="sm">Open Account</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-16 md:pt-20 lg:pt-32 pb-24 lg:pb-36">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left z-10">
              <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                Trusted by over 2 million customers
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl mb-6 bg-clip-text text-transparent bg-gradient-to-br from-white via-white/90 to-white/50">
                Banking that moves{" "}
                <span className="text-primary block mt-2">at your pace</span>
              </h1>
              <p className="text-lg leading-8 text-muted-foreground mb-10 max-w-2xl">
                Experience seamless personal and business banking with
                Meridian&nbsp;Bank. Smarter tools, better rates, and a team that
                puts you first.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <Button size="lg" className="gap-2 h-14 px-8 text-base shadow-2xl shadow-primary/20">
                  Get Started <ArrowRight className="size-5" />
                </Button>
                <Button size="lg" variant="outline" className="h-14 px-8 text-base bg-background/50 backdrop-blur-sm border-white/10 hover:bg-white/5">
                  Talk to an Advisor
                </Button>
              </div>
              
              <div className="mt-12 flex items-center gap-x-6">
                <div className="flex -space-x-3">
                  {[
                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&q=80&fit=crop",
                    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=64&h=64&q=80&fit=crop",
                    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&q=80&fit=crop",
                    "https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?w=64&h=64&q=80&fit=crop"
                  ].map((src, i) => (
                    <img key={i} src={src} alt="User" className="inline-block h-10 w-10 rounded-full ring-2 ring-background object-cover" />
                  ))}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  <span className="font-semibold text-foreground">4.9/5</span> rating from our users
                </div>
              </div>
            </div>
            
            <div className="relative lg:h-auto w-full flex items-center justify-center lg:justify-end">
              <div className="relative w-full aspect-[4/3] max-w-[600px] lg:max-w-none">
                <div className="absolute -inset-4 bg-gradient-to-tr from-primary/30 to-purple-500/30 blur-3xl rounded-full opacity-50" />
                <img
                  src="/hero_illustration.png"
                  alt="Future Banking Abstract"
                  className="relative w-full h-full object-cover rounded-2xl shadow-2xl ring-1 ring-white/10 animate-in fade-in zoom-in duration-1000 rotate-1 hover:rotate-0 transition-transform duration-500"
                />
                
                {/* Floating Cards for extra depth */}
                <div className="absolute -bottom-10 -left-10 bg-card/80 backdrop-blur-xl p-4 rounded-xl border border-white/10 shadow-2xl animate-in slide-in-from-bottom duration-1000 delay-200 hidden sm:block">
                    <div className="flex items-center gap-4">
                        <div className="bg-green-500/20 p-2 rounded-lg">
                            <TrendingUp className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Monthly Growth</p>
                            <p className="text-xl font-bold text-foreground">+12.5%</p>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 text-center">
              <span className="text-3xl font-bold text-primary">
                {stat.value}
              </span>
              <span className="text-sm text-muted-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            Why choose Meridian&nbsp;Bank?
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Modern banking features designed to simplify your financial life and
            help you achieve your goals.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <div className="grid max-w-xl gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-4">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20 group bg-card/50 backdrop-blur-sm"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="size-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg font-semibold leading-7 tracking-tight">{feature.title}</CardTitle>
                  <CardDescription className="text-sm leading-7 text-muted-foreground">{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="border-t border-white/5 bg-muted/20">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              Products tailored for you
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Whether you&apos;re saving, spending, or borrowing — we have the
              right product at the right rate.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <div className="grid max-w-xl gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-3">
              {products.map((product) => (
                <Card
                  key={product.title}
                  className="flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20 bg-card/50 backdrop-blur-sm"
                >
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-xl font-semibold">{product.title}</CardTitle>
                      {product.badge && (
                        <Badge variant="secondary" className="text-[10px] ml-auto">
                          {product.badge}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-sm leading-6 text-muted-foreground">{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between pt-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Interest rate</p>
                      <span className="text-2xl font-bold text-primary">
                        {product.rate}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1">
                      Learn more <ArrowRight className="size-3" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Ready to bank smarter?
            </h2>
            <p className="max-w-md text-primary-foreground/80">
              Open a Meridian Bank account in minutes. No paperwork, no
              branches, no hassle.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                variant="secondary"
                className="gap-2"
              >
                Open an Account <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-foreground hover:text-primary-foreground hover:bg-primary-foreground/10 gap-2"
              >
                <PhoneCall className="size-4" /> Contact Us
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Footer */}
      <footer id="contact" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Landmark className="size-5 text-primary" />
                <span className="font-semibold">Meridian Bank</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Banking reimagined for the modern world. FDIC insured.
              </p>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Products</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Checking</a></li>
                <li><a href="#" className="hover:text-foreground">Savings</a></li>
                <li><a href="#" className="hover:text-foreground">Credit Cards</a></li>
                <li><a href="#" className="hover:text-foreground">Loans</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">About</a></li>
                <li><a href="#" className="hover:text-foreground">Careers</a></li>
                <li><a href="#" className="hover:text-foreground">Press</a></li>
                <li><a href="#" className="hover:text-foreground">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Support</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Help Center</a></li>
                <li><a href="#" className="hover:text-foreground">Security</a></li>
                <li><a href="#" className="hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground">Terms</a></li>
              </ul>
            </div>
          </div>
          <Separator className="my-8" />
          <p className="text-center text-xs text-muted-foreground">
            &copy; 2026 Meridian Bank. All rights reserved. Member FDIC.
          </p>
        </div>
        <AskAI />
        <EvaluationPanel />
      </footer>
    </div>
  );
}

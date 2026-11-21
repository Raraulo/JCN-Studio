import './globals.css';

export const metadata = {
  title: 'JCN Studio',
  description: 'Tu biblioteca musical personal.',
};

export default function Layout({ children }) {
  return <html lang="es"><body>{children}</body></html>;
}

import Link from 'next/link';
import '@/components/catalog/course-home.css';

export function Footer() {
  return (
    <footer className="home-footer">
      <div className="home-footer-inner">
        <span className="home-footer-title home-wordmark">nonchalant</span>
        <p>Самостоятельный шахматный практикум: атака, эндшпиль и анализ партий.<br />Источники и происхождение позиций указаны в разборах.</p>
        <Link href="/#sources">О материалах <span aria-hidden="true">↗</span></Link>
      </div>
    </footer>
  );
}
export default Footer;

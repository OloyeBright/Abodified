import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import BackBar from './components/BackBar';
import ErrorBoundary from './components/ErrorBoundary';
import AccountTypeGate from './components/AccountTypeGate';
import Home from './pages/Home';
import Browse from './pages/Browse';
import PostListing from './pages/PostListing';
import ListingDetail from './pages/ListingDetail';
import Admin from './pages/Admin';
import AdminReports from './pages/AdminReports';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Notifications from './pages/Notifications';
import MyListings from './pages/MyListings';
import Profile from './pages/Profile';
import Verify from './pages/Verify';
import AdminUsers from './pages/AdminUsers';
import Messages from './pages/Messages';


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// key={pathname} resets the error screen every time you move to another page
function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/post-listing" element={<PostListing />} />
        <Route path="/post" element={<Navigate to="/post-listing" replace />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/reports" element={<AdminReports />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:id" element={<Messages />} />
        <Route path="/my-listings" element={<MyListings />} />
        <Route path="/settings" element={<Profile />} />
        <Route path="/u/:id" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Navbar />
      <BackBar />
      <AccountTypeGate />
      <AppRoutes />
    </Router>
  );
}